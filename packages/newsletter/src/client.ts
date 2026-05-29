import { fromAddress, sendEmail } from "@ingram-tech/email";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
	buildListUnsubscribeHeaders,
	derivePreviewText,
	type NewsletterRenderInput,
	renderNewsletterHtml,
	renderNewsletterText,
} from "./render";
import {
	type Newsletter,
	newsletterSchema,
	type Subscription,
	subscriptionSchema,
} from "./types";

export interface NewsletterConfig {
	/** A Supabase client with service-role access (writes bypass RLS). */
	supabase: SupabaseClient;
	/** Absolute base URL for the unsubscribe link, e.g. "https://example.com". */
	baseUrl: string;
	/** Unsubscribe route path. Default "/api/newsletter/unsubscribe". */
	unsubscribePath?: string;
	/** Override the built-in HTML/text rendering. */
	render?: (input: NewsletterRenderInput) => { html: string; text: string };
}

export interface SubscribeOptions {
	newsletterSlug: string;
	email: string;
	source?: string;
	userId?: string;
}

export interface SendOptions {
	newsletterSlug: string;
	subject: string;
	/** Plain-text body; blank lines split paragraphs in the default renderer. */
	content: string;
	previewText?: string;
	cta?: { label: string; href: string };
	/** If set, only send to these addresses (case-insensitive). For test sends. */
	onlyTo?: string[];
}

export interface SendResult {
	newsletter: Newsletter;
	totalRecipients: number;
	sentCount: number;
	failedCount: number;
	failures: { email: string; error: string }[];
}

/**
 * Build a newsletter client bound to a Supabase project. The package owns its
 * tables (see migrations/) and defines its own row types; you inject the client
 * and base URL.
 */
export const createNewsletter = (config: NewsletterConfig) => {
	const { supabase, baseUrl } = config;
	const unsubscribePath = config.unsubscribePath ?? "/api/newsletter/unsubscribe";
	const normalize = (email: string) => email.trim().toLowerCase();
	const unsubscribeUrl = (token: string) =>
		`${baseUrl}${unsubscribePath}?token=${encodeURIComponent(token)}`;
	const renderFn =
		config.render ??
		((input: NewsletterRenderInput) => ({
			html: renderNewsletterHtml(input),
			text: renderNewsletterText(input),
		}));

	const getBySlug = async (slug: string): Promise<Newsletter | null> => {
		const { data, error } = await supabase
			.from("newsletters")
			.select("*")
			.eq("slug", slug)
			.maybeSingle();
		if (error) throw new Error(`Failed to load newsletter: ${error.message}`);
		return data === null ? null : newsletterSchema.parse(data);
	};

	/**
	 * Idempotent subscribe: new email → insert; active sub → noop; previously
	 * unsubscribed → resurrect (clear unsubscribed_at).
	 */
	const subscribe = async (options: SubscribeOptions): Promise<Subscription> => {
		const email = normalize(options.email);
		const newsletter = await getBySlug(options.newsletterSlug);
		if (!newsletter) {
			throw new Error(`Unknown newsletter: ${options.newsletterSlug}`);
		}
		if (!newsletter.is_active) {
			throw new Error(`Newsletter is not active: ${options.newsletterSlug}`);
		}

		const { data: existingData, error: lookupError } = await supabase
			.from("newsletter_subscriptions")
			.select("*")
			.eq("newsletter_id", newsletter.id)
			.eq("email", email)
			.maybeSingle();
		if (lookupError) {
			throw new Error(`Failed to look up subscription: ${lookupError.message}`);
		}
		const existing =
			existingData === null ? null : subscriptionSchema.parse(existingData);

		if (existing) {
			if (!existing.unsubscribed_at && (!options.userId || existing.user_id)) {
				return existing;
			}
			const { data: updated, error } = await supabase
				.from("newsletter_subscriptions")
				.update({
					unsubscribed_at: null,
					source: options.source ?? existing.source,
					user_id: existing.user_id ?? options.userId ?? null,
				})
				.eq("id", existing.id)
				.select()
				.single();
			if (error) throw new Error(`Failed to resubscribe: ${error.message}`);
			return subscriptionSchema.parse(updated);
		}

		const { data: inserted, error } = await supabase
			.from("newsletter_subscriptions")
			.insert({
				newsletter_id: newsletter.id,
				email,
				source: options.source ?? null,
				user_id: options.userId ?? null,
			})
			.select()
			.single();
		if (error) throw new Error(`Failed to subscribe: ${error.message}`);
		return subscriptionSchema.parse(inserted);
	};

	/** Unsubscribe by token. Idempotent; returns false only for unknown tokens. */
	const unsubscribe = async (token: string): Promise<boolean> => {
		const { data, error } = await supabase
			.from("newsletter_subscriptions")
			.select("id, unsubscribed_at")
			.eq("unsubscribe_token", token)
			.maybeSingle();
		if (error) throw new Error(`Failed to look up token: ${error.message}`);
		const row =
			data === null
				? null
				: subscriptionSchema
						.pick({ id: true, unsubscribed_at: true })
						.parse(data);
		if (!row) return false;
		if (row.unsubscribed_at) return true;

		const { error: updateError } = await supabase
			.from("newsletter_subscriptions")
			.update({ unsubscribed_at: new Date().toISOString() })
			.eq("id", row.id);
		if (updateError) {
			throw new Error(`Failed to unsubscribe: ${updateError.message}`);
		}
		return true;
	};

	const listActiveSubscribers = async (
		newsletterSlug: string,
	): Promise<Subscription[]> => {
		const newsletter = await getBySlug(newsletterSlug);
		if (!newsletter) throw new Error(`Unknown newsletter: ${newsletterSlug}`);
		const { data, error } = await supabase
			.from("newsletter_subscriptions")
			.select("*")
			.eq("newsletter_id", newsletter.id)
			.is("unsubscribed_at", null)
			.order("subscribed_at", { ascending: true });
		if (error) throw new Error(`Failed to list subscribers: ${error.message}`);
		return subscriptionSchema.array().parse(data ?? []);
	};

	/**
	 * Send to all active subscribers (or just `onlyTo`). Each recipient gets a
	 * per-row List-Unsubscribe header. Failures are caught per-recipient so one
	 * bad address doesn't poison the batch.
	 *
	 * Sends are sequential (one awaited `sendEmail` per recipient) with no
	 * built-in rate limiting or retry — fine for the small lists we run today;
	 * revisit (batching/backoff) before large sends.
	 */
	const send = async (options: SendOptions): Promise<SendResult> => {
		const newsletter = await getBySlug(options.newsletterSlug);
		if (!newsletter) {
			throw new Error(`Unknown newsletter: ${options.newsletterSlug}`);
		}
		const subscribers = await listActiveSubscribers(options.newsletterSlug);
		const targets = options.onlyTo
			? (() => {
					const allowed = new Set(options.onlyTo.map(normalize));
					return subscribers.filter((s) => allowed.has(s.email));
				})()
			: subscribers;

		const fromAddr = fromAddress(newsletter.from_name, newsletter.from_local_part);
		const previewText = options.previewText ?? derivePreviewText(options.content);
		const result: SendResult = {
			newsletter,
			totalRecipients: targets.length,
			sentCount: 0,
			failedCount: 0,
			failures: [],
		};

		for (const sub of targets) {
			const unsubUrl = unsubscribeUrl(sub.unsubscribe_token);
			try {
				const { html, text } = renderFn({
					newsletterName: newsletter.name,
					subject: options.subject,
					content: options.content,
					cta: options.cta,
					unsubscribeUrl: unsubUrl,
					previewText,
				});
				await sendEmail({
					to: sub.email,
					from: fromAddr,
					replyTo: newsletter.reply_to ?? undefined,
					subject: options.subject,
					html,
					text,
					headers: buildListUnsubscribeHeaders(unsubUrl, fromAddr),
				});
				result.sentCount += 1;
			} catch (err) {
				result.failedCount += 1;
				result.failures.push({
					email: sub.email,
					error: err instanceof Error ? err.message : String(err),
				});
			}
		}
		return result;
	};

	return { getBySlug, subscribe, unsubscribe, listActiveSubscribers, send };
};
