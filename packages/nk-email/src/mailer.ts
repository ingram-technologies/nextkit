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
 * What lands in the log is metadata only (see {@link ./log}); a site that keeps
 * its own body-storing log is not expected to replace it with this one, and can
 * write to both from the same call site.
 */

import { type EmailOptions, sendEmail } from "./client.js";
import { type EmailKind, type Queryable, recordEmail } from "./log.js";

export interface MailerConfig {
	/**
	 * A `pg` Pool/PoolClient or nk-db query interface (see {@link Queryable}).
	 * When set, every send is recorded to `nk_email_log`; when omitted, the
	 * mailer is a pure pass-through to {@link sendEmail} and nothing is logged.
	 */
	db?: Queryable;
	/** Kind stamped on a send that doesn't specify one. Default "transactional". */
	defaultKind?: EmailKind;
}

/** {@link sendEmail} options plus the metadata the log records. */
export interface SendOptions extends EmailOptions {
	/** Overrides {@link MailerConfig.defaultKind} for this send. */
	kind?: EmailKind;
	/** Catalog entry key this send corresponds to, recorded for the history. */
	templateKey?: string;
	/** Marketing campaign/issue key, recorded for the history. */
	campaignKey?: string;
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

	const send = async (options: SendOptions): Promise<void> => {
		const { kind, templateKey, campaignKey, ...emailOptions } = options;
		try {
			await sendEmail(emailOptions);
		} catch (err) {
			if (config.db) {
				await recordEmail(config.db, {
					kind: kind ?? defaultKind,
					recipient: primaryRecipient(options.to),
					subject: options.subject,
					sender: options.from,
					templateKey,
					campaignKey,
					status: "failed",
					error: err instanceof Error ? err.message : String(err),
				});
			}
			throw err;
		}
		if (config.db) {
			await recordEmail(config.db, {
				kind: kind ?? defaultKind,
				recipient: primaryRecipient(options.to),
				subject: options.subject,
				sender: options.from,
				templateKey,
				campaignKey,
				status: "sent",
			});
		}
	};

	return { send };
};
