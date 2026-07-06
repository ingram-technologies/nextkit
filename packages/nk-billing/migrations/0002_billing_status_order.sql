-- @ingram-tech/nk-billing — out-of-order webhook defense.
--
-- Stripe does not guarantee event delivery order. `recordSubscriptionStatus`
-- stamps the Stripe event's `created` timestamp here (when the caller passes
-- `eventCreated`) and refuses to overwrite the cached status with an older
-- event, so a delayed `customer.subscription.updated` can't resurrect a
-- subscription that a later `customer.subscription.deleted` already canceled.

alter table billing_credits
	add column if not exists subscription_status_at timestamptz;
