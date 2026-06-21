-- @ingram-tech/nk-billing — credit ledger + Stripe event-dedup store.
--
-- The stateful slice of nk-billing, only for sites that use the credit ledger
-- (`@ingram-tech/nk-billing/credits`). Sites that only do subscriptions, or use
-- the Stripe-side wallet (`./balance`), do NOT need this migration.
--
-- Tenancy is the consuming site's concern (see credits.ts): these tables are
-- keyed by an opaque `tenant_id` and carry NO row-level security here. Apply
-- your own isolation to match your stack:
--   * RLS sites: add a `tenant_isolation` policy keyed on tenant_id and reach
--     the rows through nk-db's `withRlsTransaction` / `withTenant`.
--   * App-layer-filtering sites: every query already passes tenant_id; nothing
--     extra is required.
--
-- Ship this as a Drizzle schema fragment + generated SQL so it composes with the
-- consuming site's drizzle-kit pipeline (see docs/db-package.md). Adjust the
-- table names only if they collide; the ledger code hardcodes them.

create table if not exists billing_credits (
	tenant_id          text         primary key,
	-- Abstract credits, not money. Bigint so high-volume metering can't overflow.
	credits_balance    bigint       not null default 0,
	-- Cached Stripe subscription status (active / trialing / past_due / …), kept
	-- fresh by the customer.subscription.* webhook via recordSubscriptionStatus().
	subscription_status text,
	-- Cached Stripe customer id, backfilled from webhooks. A read-side convenience;
	-- the authoritative link is the customer's metadata tag (see customers.ts).
	stripe_customer_id text,
	-- When the lazy trial clock started (set on first spend when trials are on).
	trial_started_at   timestamptz,
	created_at         timestamptz  not null default now(),
	updated_at         timestamptz  not null default now()
);

-- Idempotency log for inbound Stripe webhooks. Each event id is inserted once,
-- in the same transaction as the state change it guards, so retries are no-ops.
-- Synthetic ids (e.g. `subgrant:<sub>:<periodStart>`) dedupe per-period grants.
create table if not exists billing_stripe_events (
	event_id   text        primary key,
	type       text        not null,
	created_at timestamptz not null default now()
);
