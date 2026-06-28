/**
 * Row interfaces for the package's own tables (see migrations/0001_marketing.sql)
 * and the public option/result shapes. Following the nk-billing precedent, these
 * are plain typed interfaces read via `db.query<Row>(...)` rather than Zod
 * schemas: the rows come back from a typed `pg`/nk-db query, not from untyped
 * external JSON, so the boundary that the "validate with Zod" rule guards isn't
 * crossed here.
 *
 * Timestamps are typed as `string`. The client only ever reads them for
 * null-ness, so the exact representation `pg` returns does not matter to this
 * package.
 */

/** Row of `marketing_contacts`. */
export interface Contact {
	id: string;
	email: string;
	user_id: string | null;
	locale: string | null;
	unsubscribe_token: string;
	unsubscribed_all_at: string | null;
}

/** Row of `marketing_audiences`. */
export interface Audience {
	id: string;
	slug: string;
	name: string;
	from_name: string;
	from_local_part: string;
	reply_to: string | null;
	is_active: boolean;
}

/** Row of `marketing_subscriptions`. */
export interface Subscription {
	id: string;
	audience_id: string;
	contact_id: string;
	unsubscribe_token: string;
	unsubscribed_at: string | null;
	source: string | null;
}

/** A call-to-action button rendered in the email body. */
export interface Cta {
	label: string;
	href: string;
}

/** Sender identity for a lifecycle send (broadcasts take it from the audience). */
export interface Sender {
	/** Display name, e.g. "Peppost". */
	name: string;
	/** Local part of the from address; defaults to "notifications". */
	localPart?: string;
	replyTo?: string;
}

export interface IdentifyOptions {
	email: string;
	userId?: string;
	locale?: string;
}

export interface SubscribeOptions {
	audienceSlug: string;
	email: string;
	source?: string;
	userId?: string;
}

export interface BroadcastOptions {
	audienceSlug: string;
	subject: string;
	/** Plain-text body; blank lines split paragraphs in the default renderer. */
	content: string;
	previewText?: string;
	cta?: Cta;
	/** If set, only send to these addresses (case-insensitive). For test sends. */
	onlyTo?: string[];
	/**
	 * If set, each recipient is claimed in `marketing_deliveries` under this key
	 * before sending, making a re-run idempotent (the issue id is a good value).
	 * Omit to send unconditionally to every active subscriber.
	 */
	campaignKey?: string;
}

export interface LifecycleOptions {
	/** Stable program/step key, e.g. "first-invoice-nudge". Dedupes per contact. */
	campaignKey: string;
	email: string;
	userId?: string;
	locale?: string;
	subject: string;
	content: string;
	previewText?: string;
	cta?: Cta;
	from: Sender;
	/**
	 * Footer line explaining why the contact received this, e.g. "you have a
	 * Peppost account". Defaults to a generic account-based reason.
	 */
	footerReason?: string;
}

export interface BroadcastResult {
	totalRecipients: number;
	sentCount: number;
	/** Recipients skipped because already delivered under `campaignKey`. */
	skippedCount: number;
	failedCount: number;
	failures: { email: string; error: string }[];
}

export type LifecycleResult =
	| { status: "sent" }
	/** Contact has globally opted out of marketing. */
	| { status: "suppressed" }
	/** Already delivered to this contact under this campaignKey. */
	| { status: "duplicate" };

export type UnsubscribeResult =
	| { status: "unsubscribed"; scope: "audience" | "global" }
	/** Token matched but was already unsubscribed. */
	| { status: "already" }
	/** No subscription or contact carries this token. */
	| { status: "unknown" };
