-- @ingram-tech/nk-marketing — contacts, audiences, subscriptions, deliveries.
--
-- The stateful slice powering newsletter broadcasts AND post-signup lifecycle
-- email. This is the Postgres-native successor to @ingram-tech/newsletter
-- (which was Supabase/RLS-bound). Like @ingram-tech/nk-billing's ledger, these
-- tables carry NO row-level security: a nextkit site reaches them through its
-- app role and filters in the app layer. Add your own RLS only if your stack
-- needs it.
--
-- Ship this as a Drizzle schema fragment + generated SQL so it composes with the
-- consuming site's drizzle-kit pipeline (see docs/marketing.md). Table names are
-- hardcoded by the client; adjust only on a collision.
--
-- updated_at is maintained in app code (the client sets `updated_at = now()` on
-- every UPDATE) rather than by a trigger, to keep this migration plpgsql-free
-- and identical across Postgres and PGlite.

-- One contact per email address per site. The unit of identity and consent.
create table if not exists marketing_contacts (
	id                  uuid        primary key default gen_random_uuid(),
	-- Lowercased email is the natural key.
	email               text        not null unique,
	-- Optional link to the site's own user/account id; lets you target by user.
	user_id             text,
	-- BCP-47 locale for localized sends; null = site default.
	locale              text,
	-- 256-bit random token behind the GLOBAL one-click unsubscribe link.
	-- Generated in app code (no pgcrypto dependency); never the row id.
	unsubscribe_token   text        not null unique,
	-- Global marketing opt-out. NULL = opted in. Set by a contact-token
	-- unsubscribe; suppresses BOTH lifecycle sends and broadcasts.
	unsubscribed_all_at timestamptz,
	created_at          timestamptz not null default now(),
	updated_at          timestamptz not null default now(),
	constraint marketing_contacts_email_lower check (email = lower(email)),
	constraint marketing_contacts_email_format check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

-- Registry of broadcast lists (newsletters). The sending address is
-- "<from_local_part>@<EMAIL_FROM_DOMAIN>". Lifecycle campaigns do NOT need an
-- audience row — they pass their sender inline and target contacts directly.
create table if not exists marketing_audiences (
	id              uuid        primary key default gen_random_uuid(),
	slug            text        not null unique,
	name            text        not null,
	from_name       text        not null,
	from_local_part text        not null default 'news',
	reply_to        text,
	is_active       boolean     not null default true,
	created_at      timestamptz not null default now(),
	updated_at      timestamptz not null default now(),
	constraint marketing_audiences_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
	constraint marketing_audiences_from_local_part_format check (from_local_part ~ '^[a-z0-9][a-z0-9._-]*$')
);

-- A contact's opt-in to one audience. One row per (audience, contact); kept on
-- unsubscribe so a re-subscribe is detectable.
create table if not exists marketing_subscriptions (
	id                uuid        primary key default gen_random_uuid(),
	audience_id       uuid        not null references marketing_audiences (id) on delete cascade,
	contact_id        uuid        not null references marketing_contacts (id) on delete cascade,
	-- Per-subscription token: a broadcast unsubscribe link drops just THIS list,
	-- distinct from the contact's global token.
	unsubscribe_token text        not null unique,
	subscribed_at     timestamptz not null default now(),
	unsubscribed_at   timestamptz,
	source            text,
	created_at        timestamptz not null default now(),
	updated_at        timestamptz not null default now(),
	constraint marketing_subscriptions_audience_contact_key unique (audience_id, contact_id)
);

create index if not exists idx_marketing_subscriptions_audience on marketing_subscriptions (audience_id);
create index if not exists idx_marketing_subscriptions_contact on marketing_subscriptions (contact_id);
-- Hot path: enumerating active subscribers for a broadcast.
create index if not exists idx_marketing_subscriptions_active on marketing_subscriptions (audience_id) where unsubscribed_at is null;

-- Idempotency log. One row per (campaign_key, contact), claimed BEFORE a send so
-- a retry or an overlapping cron can never deliver the same campaign twice. For
-- lifecycle: campaign_key is the program/step key ("first-invoice-nudge"). For
-- broadcasts: pass the issue id as campaign_key to make a re-run idempotent.
create table if not exists marketing_deliveries (
	campaign_key text        not null,
	contact_id   uuid        not null references marketing_contacts (id) on delete cascade,
	sent_at      timestamptz not null default now(),
	primary key (campaign_key, contact_id)
);
