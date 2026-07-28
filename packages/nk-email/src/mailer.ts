/**
 * A mailer that logs. {@link createMailer} wraps {@link sendEmail} so every
 * dispatch lands in `nk_email_log` (see {@link ./log}), giving a site the send
 * history an operator surface reads — while staying a thin pass-through to the
 * same Cloudflare client.
 *
 * Adoption is a one-line swap at the site's existing email wrapper: build the
 * mailer once (with the app's pool) and call `mailer.send(...)` where it called
 * `sendEmail(...)`. When no `db` is configured the mailer is a pure pass-through
 * — logging is opt-in, so a site can adopt the API first and turn on persistence
 * later without touching call sites.
 *
 * A row is metadata by default. {@link MailerConfig.captureBody} additionally
 * archives the rendered message, which is what a "preview exactly what was sent"
 * surface needs — read the secrets/retention note on that option before turning
 * it on, and keep credential-bearing auth mail out with a per-send
 * `captureBody: false`.
 */

import { type EmailOptions, sendEmail } from "./client.js";
import { type EmailBody, type EmailKind, type Queryable, recordEmail } from "./log.js";

export interface MailerConfig {
	/**
	 * A `pg` Pool/PoolClient or nk-db query interface (see {@link Queryable}).
	 * When set, every send is recorded to `nk_email_log`; when omitted, the
	 * mailer is a pure pass-through to {@link sendEmail} and nothing is logged.
	 */
	db?: Queryable;
	/** Kind stamped on a send that doesn't specify one. Default "transactional". */
	defaultKind?: EmailKind;
	/**
	 * Archive the rendered `html`/`text` of every send in the row's `body` jsonb
	 * column, turning the log into something a "preview exactly what was sent"
	 * surface can read. Default `false` — the log stays metadata-only unless you
	 * ask for this.
	 *
	 * Requires `migrations/0002_email_log_extras.sql`. Two things you take on by
	 * turning it on:
	 *
	 * - **Secrets.** Verification, password-reset and magic-link bodies contain a
	 *   live credential; archived, they make read access to this table equivalent
	 *   to account takeover. Pass `captureBody: false` on those sends (see
	 *   {@link SendOptions.captureBody}) — the metadata row is still written.
	 * - **Retention.** Stored bodies are personal data and nothing expires them
	 *   for you; schedule a purge (recipe in the package README).
	 */
	captureBody?: boolean;
}

/** {@link sendEmail} options plus the metadata the log records. */
export interface SendOptions extends EmailOptions {
	/** Overrides {@link MailerConfig.defaultKind} for this send. */
	kind?: EmailKind;
	/** Catalog entry key this send corresponds to, recorded for the history. */
	templateKey?: string;
	/** Marketing campaign/issue key, recorded for the history. */
	campaignKey?: string;
	/**
	 * Overrides {@link MailerConfig.captureBody} for this send. Set `false` on
	 * anything carrying a live credential (verification, reset, magic link) to
	 * keep it out of the archive while still logging the send itself; set `true`
	 * to archive one message from an otherwise metadata-only mailer.
	 */
	captureBody?: boolean;
	/**
	 * Site-defined correlation data stored on the row's `meta` jsonb column —
	 * the seam for linking a logged send back to your own records, since
	 * `nk_email_log` holds no foreign key into a site's tables. Ids, not
	 * payloads. See {@link EmailLogRecord.meta}.
	 */
	meta?: Record<string, unknown>;
}

/** The bare primary recipient — first address when `to` is a list. */
const primaryRecipient = (to: string | string[]): string =>
	Array.isArray(to) ? (to[0] ?? "") : to;

export interface Mailer {
	/**
	 * Send an email and (when the mailer has a `db`) record it. On a send
	 * failure the failure is logged too, then rethrown — the caller's
	 * error-handling and retry policy are unchanged from bare {@link sendEmail}.
	 */
	send(options: SendOptions): Promise<void>;
}

export const createMailer = (config: MailerConfig = {}): Mailer => {
	const defaultKind: EmailKind = config.defaultKind ?? "transactional";
	const defaultCapture = config.captureBody ?? false;

	const send = async (options: SendOptions): Promise<void> => {
		const { kind, templateKey, campaignKey, captureBody, meta, ...emailOptions } =
			options;
		// The rendered parts, when this send archives them. A failed send is
		// captured too: what we tried to deliver is exactly what you want to look
		// at when working out why it didn't land.
		const body: EmailBody | undefined =
			(captureBody ?? defaultCapture)
				? {
						...(options.html === undefined ? {} : { html: options.html }),
						...(options.text === undefined ? {} : { text: options.text }),
					}
				: undefined;
		const common = {
			kind: kind ?? defaultKind,
			recipient: primaryRecipient(options.to),
			subject: options.subject,
			sender: options.from,
			templateKey,
			campaignKey,
			body,
			meta,
		};
		try {
			await sendEmail(emailOptions);
		} catch (err) {
			if (config.db) {
				await recordEmail(config.db, {
					...common,
					status: "failed",
					error: err instanceof Error ? err.message : String(err),
				});
			}
			throw err;
		}
		if (config.db) {
			await recordEmail(config.db, { ...common, status: "sent" });
		}
	};

	return { send };
};
