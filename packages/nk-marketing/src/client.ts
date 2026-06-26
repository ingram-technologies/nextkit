/**
 * The marketing client: contacts + consent, newsletter audiences/subscriptions
 * (broadcast), and idempotent triggered campaigns (lifecycle). Follows
 * nextkit's Django-app model — the package owns its tables (migrations/) and
 * takes the database by injection; the consuming site owns tenancy, scheduling,
 * and the conditions that decide *who* gets a lifecycle email *when*.
 *
 * The division of labour for lifecycle email (the "send your first invoice"
 * nudge): the SITE runs a daily cron and queries its own schema to find due
 * contacts (e.g. signed up 30+ days ago, never sent an invoice). For each, it
 * calls {@link sendLifecycle}, which owns the cross-cutting parts — suppression
 * (global opt-out), exactly-once delivery (claim before send), one-click
 * unsubscribe, and rendering. The site never re-implements those.
 */

import { fromAddress, sendEmail } from "@ingram-tech/nk-email";
import { generateToken, normalizeEmail, type Queryable } from "./db.js";
import {
	derivePreviewText,
	type MarketingRenderInput,
	renderMarketingHtml,
	renderMarketingText,
} from "./render.js";
import type {
	Audience,
	BroadcastOptions,
	BroadcastResult,
	Contact,
	IdentifyOptions,
	LifecycleOptions,
	LifecycleResult,
	Sender,
	SubscribeOptions,
	Subscription,
	UnsubscribeResult,
} from "./types.js";

export interface MarketingConfig {
	/** A `pg` Pool/PoolClient or nk-db query interface (see {@link Queryable}). */
	db: Queryable;
	/** Absolute base URL for unsubscribe links, e.g. "https://example.com". */
	baseUrl: string;
	/** Unsubscribe route path. Default "/api/marketing/unsubscribe". */
	unsubscribePath?: string;
	/** Override the built-in HTML/text rendering. */
	render?: (input: MarketingRenderInput) => { html: string; text: string };
}

/** The bare address inside a "Name <addr>" string (or the string itself). */
const bareAddress = (from: string): string => from.match(/<([^>]+)>/)?.[1] ?? from;

export const createMarketing = (config: MarketingConfig) => {
	const { db, baseUrl } = config;
	const unsubscribePath = config.unsubscribePath ?? "/api/marketing/unsubscribe";
	const unsubscribeUrl = (token: string) =>
		`${baseUrl}${unsubscribePath}?token=${encodeURIComponent(token)}`;
	const renderFn =
		config.render ??
		((input: MarketingRenderInput) => ({
			html: renderMarketingHtml(input),
			text: renderMarketingText(input),
		}));

	/**
	 * Upsert a contact by email. New email → insert (with a fresh unsubscribe
	 * token); existing → backfill user_id/locale without overwriting consent or
	 * the token. The unit every other call resolves to.
	 */
	const identify = async (options: IdentifyOptions): Promise<Contact> => {
		const email = normalizeEmail(options.email);
		const { rows } = await db.query<Contact>(
			`insert into marketing_contacts (email, user_id, locale, unsubscribe_token)
			 values ($1, $2, $3, $4)
			 on conflict (email) do update set
			   user_id = coalesce(marketing_contacts.user_id, excluded.user_id),
			   locale = coalesce(excluded.locale, marketing_contacts.locale),
			   updated_at = now()
			 returning id, email, user_id, locale, unsubscribe_token, unsubscribed_all_at`,
			[email, options.userId ?? null, options.locale ?? null, generateToken()],
		);
		const contact = rows[0];
		if (!contact) throw new Error("nk-marketing: failed to upsert contact");
		return contact;
	};

	const getAudienceBySlug = async (slug: string): Promise<Audience | null> => {
		const { rows } = await db.query<Audience>(
			`select id, slug, name, from_name, from_local_part, reply_to, is_active
			 from marketing_audiences where slug = $1`,
			[slug],
		);
		return rows[0] ?? null;
	};

	const requireAudience = async (slug: string): Promise<Audience> => {
		const audience = await getAudienceBySlug(slug);
		if (!audience) throw new Error(`nk-marketing: unknown audience "${slug}"`);
		return audience;
	};

	/**
	 * Idempotent subscribe to a broadcast audience: new → insert; existing →
	 * resurrect (clear unsubscribed_at) and backfill source. Identifies the
	 * contact first so consent and identity share one row.
	 */
	const subscribe = async (options: SubscribeOptions): Promise<Subscription> => {
		const audience = await requireAudience(options.audienceSlug);
		if (!audience.is_active) {
			throw new Error(
				`nk-marketing: audience is not active "${options.audienceSlug}"`,
			);
		}
		const contact = await identify({
			email: options.email,
			userId: options.userId,
		});
		const { rows } = await db.query<Subscription>(
			`insert into marketing_subscriptions (audience_id, contact_id, unsubscribe_token, source)
			 values ($1, $2, $3, $4)
			 on conflict (audience_id, contact_id) do update set
			   unsubscribed_at = null,
			   source = coalesce(excluded.source, marketing_subscriptions.source),
			   updated_at = now()
			 returning id, audience_id, contact_id, unsubscribe_token, unsubscribed_at, source`,
			[audience.id, contact.id, generateToken(), options.source ?? null],
		);
		const subscription = rows[0];
		if (!subscription) throw new Error("nk-marketing: failed to subscribe");
		return subscription;
	};

	/**
	 * Resolve an unsubscribe token and act on it. A subscription token drops just
	 * that audience; a contact token is a global marketing opt-out (suppresses
	 * everything). Idempotent — a second click reports "already". Point your
	 * unsubscribe route straight at this.
	 */
	const unsubscribe = async (token: string): Promise<UnsubscribeResult> => {
		const sub = await db.query<{ id: string; unsubscribed_at: string | null }>(
			`select id, unsubscribed_at from marketing_subscriptions where unsubscribe_token = $1`,
			[token],
		);
		const subRow = sub.rows[0];
		if (subRow) {
			if (subRow.unsubscribed_at) return { status: "already" };
			await db.query(
				`update marketing_subscriptions set unsubscribed_at = now(), updated_at = now()
				 where id = $1`,
				[subRow.id],
			);
			return { status: "unsubscribed", scope: "audience" };
		}

		const contact = await db.query<{
			id: string;
			unsubscribed_all_at: string | null;
		}>(
			`select id, unsubscribed_all_at from marketing_contacts where unsubscribe_token = $1`,
			[token],
		);
		const contactRow = contact.rows[0];
		if (contactRow) {
			if (contactRow.unsubscribed_all_at) return { status: "already" };
			await db.query(
				`update marketing_contacts set unsubscribed_all_at = now(), updated_at = now()
				 where id = $1`,
				[contactRow.id],
			);
			return { status: "unsubscribed", scope: "global" };
		}

		return { status: "unknown" };
	};

	/** Claim (campaign_key, contact) before a send. Returns false if already taken. */
	const claimDelivery = async (
		campaignKey: string,
		contactId: string,
	): Promise<boolean> => {
		const { rows } = await db.query(
			`insert into marketing_deliveries (campaign_key, contact_id) values ($1, $2)
			 on conflict (campaign_key, contact_id) do nothing returning contact_id`,
			[campaignKey, contactId],
		);
		return rows.length > 0;
	};

	/** Release a claim so a failed send can be retried on the next run. */
	const releaseDelivery = async (
		campaignKey: string,
		contactId: string,
	): Promise<void> => {
		await db.query(
			`delete from marketing_deliveries where campaign_key = $1 and contact_id = $2`,
			[campaignKey, contactId],
		);
	};

	const send = async (args: {
		to: string;
		from: string;
		replyTo?: string;
		subject: string;
		input: MarketingRenderInput;
	}): Promise<void> => {
		const { html, text } = renderFn(args.input);
		await sendEmail({
			to: args.to,
			from: args.from,
			replyTo: args.replyTo,
			subject: args.subject,
			html,
			text,
			listUnsubscribe: {
				url: args.input.unsubscribeUrl,
				mailto: bareAddress(args.from),
			},
		});
	};

	/**
	 * Send a broadcast to every active subscriber of an audience (a global
	 * opt-out excludes them too). Each recipient gets a per-subscription
	 * unsubscribe link. Failures are caught per-recipient so one bad address
	 * can't poison the batch. Pass `campaignKey` to make a re-run idempotent
	 * (recipients already delivered under that key are skipped).
	 *
	 * Sends are sequential with no built-in rate limiting — fine for the lists we
	 * run today; revisit (batching/backoff) before large sends.
	 */
	const sendBroadcast = async (
		options: BroadcastOptions,
	): Promise<BroadcastResult> => {
		const audience = await requireAudience(options.audienceSlug);
		const { rows: recipients } = await db.query<{
			sub_token: string;
			contact_id: string;
			email: string;
		}>(
			`select s.unsubscribe_token as sub_token, c.id as contact_id, c.email as email
			 from marketing_subscriptions s
			 join marketing_contacts c on c.id = s.contact_id
			 where s.audience_id = $1
			   and s.unsubscribed_at is null
			   and c.unsubscribed_all_at is null
			 order by s.subscribed_at asc`,
			[audience.id],
		);

		const targets = options.onlyTo
			? (() => {
					const allowed = new Set(options.onlyTo.map(normalizeEmail));
					return recipients.filter((r) => allowed.has(r.email));
				})()
			: recipients;

		const from = fromAddress(audience.from_name, audience.from_local_part);
		const previewText = options.previewText ?? derivePreviewText(options.content);
		const result: BroadcastResult = {
			totalRecipients: targets.length,
			sentCount: 0,
			skippedCount: 0,
			failedCount: 0,
			failures: [],
		};

		for (const r of targets) {
			if (options.campaignKey) {
				const claimed = await claimDelivery(options.campaignKey, r.contact_id);
				if (!claimed) {
					result.skippedCount += 1;
					continue;
				}
			}
			try {
				await send({
					to: r.email,
					from,
					replyTo: audience.reply_to ?? undefined,
					subject: options.subject,
					input: {
						subject: options.subject,
						content: options.content,
						cta: options.cta,
						unsubscribeUrl: unsubscribeUrl(r.sub_token),
						previewText,
						footerReason: `you subscribed to ${audience.name}`,
					},
				});
				result.sentCount += 1;
			} catch (err) {
				if (options.campaignKey) {
					await releaseDelivery(options.campaignKey, r.contact_id);
				}
				result.failedCount += 1;
				result.failures.push({
					email: r.email,
					error: err instanceof Error ? err.message : String(err),
				});
			}
		}
		return result;
	};

	/**
	 * Send one lifecycle/triggered email to one contact, at most once per
	 * `campaignKey`. Upserts the contact, then: skips if globally opted out
	 * ({@link LifecycleResult} "suppressed"); claims the delivery and skips if
	 * already sent ("duplicate"); otherwise sends with a global one-click
	 * unsubscribe link and returns "sent". The claim is released if the send
	 * throws, so the caller's next run retries. The *scheduling and eligibility*
	 * (when, and to whom) are the caller's job — see this module's header.
	 *
	 * @throws if the underlying send fails (after releasing the claim). Callers
	 *   should wrap best-effort so a mail outage never blocks their cron.
	 */
	const sendLifecycle = async (
		options: LifecycleOptions,
	): Promise<LifecycleResult> => {
		const contact = await identify({
			email: options.email,
			userId: options.userId,
			locale: options.locale,
		});
		if (contact.unsubscribed_all_at) return { status: "suppressed" };

		const claimed = await claimDelivery(options.campaignKey, contact.id);
		if (!claimed) return { status: "duplicate" };

		const sender: Sender = options.from;
		const from = fromAddress(sender.name, sender.localPart);
		try {
			await send({
				to: contact.email,
				from,
				replyTo: sender.replyTo,
				subject: options.subject,
				input: {
					subject: options.subject,
					content: options.content,
					cta: options.cta,
					unsubscribeUrl: unsubscribeUrl(contact.unsubscribe_token),
					previewText:
						options.previewText ?? derivePreviewText(options.content),
					footerReason:
						options.footerReason ??
						`you have an account with ${sender.name}`,
				},
			});
		} catch (err) {
			await releaseDelivery(options.campaignKey, contact.id);
			throw err;
		}
		return { status: "sent" };
	};

	return {
		identify,
		getAudienceBySlug,
		subscribe,
		unsubscribe,
		sendBroadcast,
		sendLifecycle,
	};
};
