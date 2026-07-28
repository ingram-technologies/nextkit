/**
 * Optional send-log — a durable **metadata** record of every email a site
 * dispatches.
 *
 * nk-email is fire-and-forget by default: {@link sendEmail} returns `void` and
 * persists nothing. When a site wants an audit trail (an operator surface asking
 * "what did we actually send, to whom, and did it land?"), it passes a database
 * to {@link createMailer} and every send writes one row to `nk_email_log`.
 *
 * **Bodies are opt-in.** By default a row is metadata only — it records that a
 * message went out, not what it said. A site that wants the stronger surface
 * ("show me exactly what this person received") turns on
 * {@link MailerConfig.captureBody}, applies `migrations/0002_email_log_extras.sql`,
 * and every row then carries the rendered `{ html, text }` in a `body` jsonb
 * column, which is enough to power a preview pane off the log itself.
 *
 * Two consequences a site must own before turning it on: **secrets** — a
 * verification / password-reset / magic-link body contains a live credential, so
 * archiving it makes read access to this table equivalent to account takeover
 * (exclude those sends per-call with `captureBody: false`) — and **retention**,
 * because stored bodies are personal data with no expiry of their own. See the
 * README and docs/transactional-email.md.
 *
 * **Correlation goes through `meta`.** The table holds no foreign key into a
 * site's own tables — that is what lets every site apply the same migration
 * unchanged — so {@link EmailLogRecord.meta} is where a caller puts its ids and
 * joins on them. It buys correlation, not referential integrity.
 *
 * Stays zero-dependency the same way nk-marketing does: the DB is taken by
 * injection through a structural {@link Queryable} — a `pg` Pool/PoolClient or
 * nk-db's query helper both satisfy it — so nk-email never imports `pg`. The
 * table ships in `migrations/0001_email_log.sql`; the consuming site applies it
 * with its own migration pipeline (nk-db's runner, drizzle-kit, …).
 *
 * Logging is **best-effort by construction**: a log-write failure must never
 * turn a delivered email into a thrown error, so {@link recordEmail} swallows its
 * own failures (to `console.error`) and the mailer never awaits it on the happy
 * path in a way that can mask the real send outcome.
 */

/**
 * The database surface the log needs, by injection — identical in spirit to
 * nk-marketing's `Queryable`. R is unconstrained so a structural `pg`
 * Pool/PoolClient, nk-db's helpers, and our own row interfaces all fit.
 */
export interface Queryable {
	query<R = Record<string, unknown>>(
		sql: string,
		params?: unknown[],
	): Promise<{ rows: R[] }>;
}

/** What sort of mail a logged row was. Discriminates the two history views. */
export type EmailKind = "transactional" | "marketing";

/** Terminal outcome of a send attempt. */
export type EmailStatus = "sent" | "failed";

/**
 * The rendered message, as stored in the `body` jsonb column. Carries whatever
 * parts the send actually had — a text-only or html-only message stores just the
 * one.
 */
export interface EmailBody {
	html?: string;
	text?: string;
	/**
	 * Set by {@link recordEmail} when a part exceeded
	 * {@link MAX_LOGGED_BODY_CHARS} and was clamped. A preview surface should say
	 * so rather than present a cut-off message as complete.
	 */
	truncated?: boolean;
}

/**
 * Per-part ceiling on a stored body. Real transactional mail runs tens of KB;
 * this is generous enough to store it whole while keeping one pathological
 * message (an inlined data-URI image, a runaway loop) from bloating the table.
 */
export const MAX_LOGGED_BODY_CHARS = 256_000;

/**
 * Ceiling on serialized {@link EmailLogRecord.meta}. `meta` is for correlation
 * keys, not payloads — a few ids, not a copy of the order. Over this, the column
 * is dropped (with a `console.error`) rather than truncated, because half a JSON
 * document is not a JSON document.
 */
export const MAX_LOGGED_META_CHARS = 4_000;

/** One send to record. Recipient is the primary address (first, if many). */
export interface EmailLogRecord {
	kind: EmailKind;
	/** Primary recipient address. */
	recipient: string;
	subject: string;
	/** The rendered `from` string, e.g. "Acme <hello@mail.acme.com>". */
	sender: string;
	status: EmailStatus;
	/** Catalog {@link EmailCatalogEntry.key} this send corresponds to, if any. */
	templateKey?: string | null;
	/** nk-marketing campaign/issue key for a marketing send, if any. */
	campaignKey?: string | null;
	/** Provider message id, when the transport returns one (Cloudflare does not). */
	messageId?: string | null;
	/** Error text on a failed send. */
	error?: string | null;
	/**
	 * The rendered message to archive. Omit (the default everywhere) and the
	 * `body` column is left out of the insert entirely, so a site that never
	 * captures bodies needs only `0001_email_log.sql`. Requires
	 * `0002_email_log_extras.sql` when set — read the secrets/retention warning in
	 * the module doc first.
	 */
	body?: EmailBody | null;
	/**
	 * Site-defined correlation data, stored as-is in the `meta` jsonb column.
	 * This is the seam for linking a row to your own records: `nk_email_log`
	 * carries no foreign key into a site's tables (that is what lets every site
	 * apply the migration unchanged), so put your id here and join on it —
	 * `join people p on p.id = (l.meta->>'personEmailId')::uuid`. Index the
	 * expression if you read that way often.
	 *
	 * Correlation keys, not payloads: capped at {@link MAX_LOGGED_META_CHARS}
	 * serialized, and dropped (never truncated) if it doesn't fit or doesn't
	 * serialize. Independent of `body` — a metadata-only log can still carry it.
	 * Requires `0002_email_log_extras.sql`.
	 */
	meta?: Record<string, unknown> | null;
}

/** Truncate long free-text so a pathological subject/error can't bloat a row. */
const clamp = (value: string, max: number): string =>
	value.length > max ? value.slice(0, max) : value;

/**
 * Clamp each part to {@link MAX_LOGGED_BODY_CHARS}, flagging the result when
 * anything was cut. Returns null for a body with no parts, so an empty object
 * doesn't add a column to the insert.
 */
const clampBody = (body: EmailBody): EmailBody | null => {
	const html =
		body.html === undefined ? undefined : clamp(body.html, MAX_LOGGED_BODY_CHARS);
	const text =
		body.text === undefined ? undefined : clamp(body.text, MAX_LOGGED_BODY_CHARS);
	if (html === undefined && text === undefined) return null;
	const truncated = html !== body.html || text !== body.text;
	return {
		...(html === undefined ? {} : { html }),
		...(text === undefined ? {} : { text }),
		...(truncated ? { truncated: true } : {}),
	};
};

/**
 * Serialize {@link EmailLogRecord.meta} for storage, or null if it can't be
 * stored — too large, or not serializable (a circular structure, a BigInt). A
 * correlation key that doesn't fit is a caller bug worth a loud line, but never
 * a reason to lose the log row, let alone the email.
 */
const serializeMeta = (meta: Record<string, unknown>): string | null => {
	let json: string;
	try {
		json = JSON.stringify(meta);
	} catch (err) {
		console.error(
			"[@ingram-tech/nk-email] meta is not serializable, dropping it",
			err,
		);
		return null;
	}
	// `undefined` from a JSON.stringify of a non-plain value, or an empty object:
	// nothing worth a column.
	if (!json || json === "{}") return null;
	if (json.length > MAX_LOGGED_META_CHARS) {
		console.error(
			`[@ingram-tech/nk-email] meta is ${json.length} chars (max ${MAX_LOGGED_META_CHARS}), dropping it — meta is for correlation keys, not payloads`,
		);
		return null;
	}
	return json;
};

/**
 * Insert one row into `nk_email_log`. **Best-effort** — never throws: a logging
 * outage must not fail the mail it is recording. On a DB error it logs to
 * `console.error` and returns. Call it after the send resolves (or rejects).
 *
 * The `body` and `meta` columns are written only when set, so a site running
 * `0001` alone never references a column it hasn't migrated in.
 */
export const recordEmail = async (
	db: Queryable,
	record: EmailLogRecord,
): Promise<void> => {
	const body = record.body ? clampBody(record.body) : null;
	const columns = [
		"kind",
		"recipient",
		"subject",
		"sender",
		"template_key",
		"campaign_key",
		"message_id",
		"status",
		"error",
	];
	const values: unknown[] = [
		record.kind,
		clamp(record.recipient, 320),
		clamp(record.subject, 998),
		clamp(record.sender, 320),
		record.templateKey ?? null,
		record.campaignKey ?? null,
		record.messageId ?? null,
		record.status,
		record.error ? clamp(record.error, 2000) : null,
	];
	// Both jsonb columns are serialized explicitly rather than relying on a driver
	// to infer jsonb from an object — pg and PGlite differ, a string casts
	// identically.
	if (body) {
		columns.push("body");
		values.push(JSON.stringify(body));
	}
	const meta = record.meta ? serializeMeta(record.meta) : null;
	if (meta) {
		columns.push("meta");
		values.push(meta);
	}
	const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
	try {
		await db.query(
			`insert into nk_email_log (${columns.join(", ")}) values (${placeholders})`,
			values,
		);
	} catch (err) {
		console.error("[@ingram-tech/nk-email] failed to write nk_email_log", err);
	}
};
