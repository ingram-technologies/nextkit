/**
 * Optional send-log — a durable **metadata** record of every email a site
 * dispatches.
 *
 * nk-email is fire-and-forget by default: {@link sendEmail} returns `void` and
 * persists nothing. When a site wants an audit trail (an operator surface asking
 * "what did we actually send, to whom, and did it land?"), it passes a database
 * to {@link createMailer} and every send writes one row to `nk_email_log`.
 *
 * **Scope, deliberately narrow: no bodies.** A row records that a message went
 * out, not what it said — no rendered html/text, and no foreign key into a
 * site's own person/user tables, which is what keeps the table standalone,
 * RLS-free, and appliable unchanged by any site. The consequence is that this
 * log cannot power a "preview exactly what was sent" pane, and a site that
 * already has a body-storing send log should keep it rather than migrate here:
 * moving would trade a feature for uniformity. The two coexist. See the README
 * and docs/transactional-email.md.
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
}

/** Truncate long free-text so a pathological subject/error can't bloat a row. */
const clamp = (value: string, max: number): string =>
	value.length > max ? value.slice(0, max) : value;

/**
 * Insert one row into `nk_email_log`. **Best-effort** — never throws: a logging
 * outage must not fail the mail it is recording. On a DB error it logs to
 * `console.error` and returns. Call it after the send resolves (or rejects).
 */
export const recordEmail = async (
	db: Queryable,
	record: EmailLogRecord,
): Promise<void> => {
	try {
		await db.query(
			`insert into nk_email_log
			   (kind, recipient, subject, sender, template_key, campaign_key, message_id, status, error)
			 values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
			[
				record.kind,
				clamp(record.recipient, 320),
				clamp(record.subject, 998),
				clamp(record.sender, 320),
				record.templateKey ?? null,
				record.campaignKey ?? null,
				record.messageId ?? null,
				record.status,
				record.error ? clamp(record.error, 2000) : null,
			],
		);
	} catch (err) {
		console.error("[@ingram-tech/nk-email] failed to write nk_email_log", err);
	}
};
