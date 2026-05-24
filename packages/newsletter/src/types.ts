/** Row of the `newsletters` table (see migrations/0001_newsletters.sql). */
export interface Newsletter {
	id: string;
	slug: string;
	name: string;
	description: string | null;
	from_name: string;
	from_local_part: string;
	reply_to: string | null;
	is_active: boolean;
	created_at: string;
	updated_at: string;
}

/** Row of the `newsletter_subscriptions` table. */
export interface Subscription {
	id: string;
	newsletter_id: string;
	email: string;
	user_id: string | null;
	unsubscribe_token: string;
	subscribed_at: string;
	unsubscribed_at: string | null;
	source: string | null;
	metadata: Record<string, unknown>;
	created_at: string;
	updated_at: string;
}
