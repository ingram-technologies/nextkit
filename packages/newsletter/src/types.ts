import { z } from "zod";

/**
 * Row schemas for the package's own tables (see migrations/0001_newsletters.sql).
 *
 * Supabase returns untyped JSON, so we validate rows with Zod at the boundary
 * rather than `as`-casting them — per the house rule "validate external input
 * with Zod, never `as SomeType`" (docs/code-style.md). The exported row types
 * are inferred from these schemas, keeping the runtime check and the type in
 * sync from a single source.
 */

/** Schema for a row of the `newsletters` table. */
export const newsletterSchema = z.object({
	id: z.string(),
	slug: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	from_name: z.string(),
	from_local_part: z.string(),
	reply_to: z.string().nullable(),
	is_active: z.boolean(),
	created_at: z.string(),
	updated_at: z.string(),
});

/** Schema for a row of the `newsletter_subscriptions` table. */
export const subscriptionSchema = z.object({
	id: z.string(),
	newsletter_id: z.string(),
	email: z.string(),
	user_id: z.string().nullable(),
	unsubscribe_token: z.string(),
	subscribed_at: z.string(),
	unsubscribed_at: z.string().nullable(),
	source: z.string().nullable(),
	metadata: z.record(z.string(), z.unknown()),
	created_at: z.string(),
	updated_at: z.string(),
});

/** Row of the `newsletters` table. */
export type Newsletter = z.infer<typeof newsletterSchema>;

/** Row of the `newsletter_subscriptions` table. */
export type Subscription = z.infer<typeof subscriptionSchema>;
