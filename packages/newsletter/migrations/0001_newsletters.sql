-- @ingram-tech/newsletter — base schema.
--
-- Portable across any Supabase project: standard UUID primary keys, no
-- project-specific ID helpers. Two tables:
--   newsletters              — registry of lists (slug, name, sender)
--   newsletter_subscriptions — one row per (newsletter, email), optionally
--                              linked to an auth user (cascade-deleted with it)
--
-- This file owns the package's tables. Apply it into your supabase/migrations.
-- For auto-linking subscriptions to users on signup, also apply
-- 0002_newsletters_auth_link.sql (optional).

create extension if not exists "pgcrypto" with schema "extensions";

create table if not exists "public"."newsletters" (
	"id" uuid primary key default gen_random_uuid(),
	"slug" text not null unique,
	"name" text not null,
	"description" text,
	"from_name" text not null,
	"from_local_part" text not null default 'news',
	"reply_to" text,
	"is_active" boolean not null default true,
	"created_at" timestamptz not null default now(),
	"updated_at" timestamptz not null default now(),
	constraint "newsletters_slug_format" check ("slug" ~ '^[a-z0-9][a-z0-9-]*$'),
	constraint "newsletters_from_local_part_format" check ("from_local_part" ~ '^[a-z0-9][a-z0-9._-]*$')
);

comment on table "public"."newsletters" is 'Registry of newsletters. The sending address is "<from_local_part>@<EMAIL_FROM_DOMAIN>".';

create table if not exists "public"."newsletter_subscriptions" (
	"id" uuid primary key default gen_random_uuid(),
	"newsletter_id" uuid not null references "public"."newsletters" ("id") on delete cascade,
	"email" text not null,
	"user_id" uuid references "auth"."users" ("id") on delete cascade,
	"unsubscribe_token" text not null unique default encode("extensions"."gen_random_bytes" (32), 'hex'),
	"subscribed_at" timestamptz not null default now(),
	"unsubscribed_at" timestamptz,
	"source" text,
	"metadata" jsonb not null default '{}'::jsonb,
	"created_at" timestamptz not null default now(),
	"updated_at" timestamptz not null default now(),
	constraint "newsletter_subscriptions_email_lower" check ("email" = lower("email")),
	constraint "newsletter_subscriptions_email_format" check ("email" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
	constraint "newsletter_subscriptions_newsletter_email_key" unique ("newsletter_id", "email")
);

comment on column "public"."newsletter_subscriptions"."unsubscribe_token" is '256-bit random token used in the List-Unsubscribe URL; regenerated per row, never exposes the id.';
comment on column "public"."newsletter_subscriptions"."unsubscribed_at" is 'NULL while subscribed; set on unsubscribe. Row is kept so re-subscriptions are detectable.';

create index if not exists "idx_newsletter_subscriptions_newsletter_id" on "public"."newsletter_subscriptions" ("newsletter_id");
create index if not exists "idx_newsletter_subscriptions_email" on "public"."newsletter_subscriptions" ("email");
create index if not exists "idx_newsletter_subscriptions_user_id" on "public"."newsletter_subscriptions" ("user_id") where "user_id" is not null;
-- Hot path: enumerating active subscribers for a send.
create index if not exists "idx_newsletter_subscriptions_active" on "public"."newsletter_subscriptions" ("newsletter_id") where "unsubscribed_at" is null;

-- updated_at maintenance
create or replace function "public"."newsletters_set_updated_at" () returns "trigger" language "plpgsql" set "search_path" to '' as $$
begin
	new.updated_at = now();
	return new;
end;
$$;

drop trigger if exists "newsletters_updated_at" on "public"."newsletters";
create trigger "newsletters_updated_at" before update on "public"."newsletters" for each row execute function "public"."newsletters_set_updated_at" ();

drop trigger if exists "newsletter_subscriptions_updated_at" on "public"."newsletter_subscriptions";
create trigger "newsletter_subscriptions_updated_at" before update on "public"."newsletter_subscriptions" for each row execute function "public"."newsletters_set_updated_at" ();

-- Row Level Security.
alter table "public"."newsletters" enable row level security;
alter table "public"."newsletter_subscriptions" enable row level security;

-- newsletters: publicly readable (preference pages list them). Writes are
-- service-role only (admin tooling / seeds).
drop policy if exists "Newsletters are publicly readable" on "public"."newsletters";
create policy "Newsletters are publicly readable" on "public"."newsletters" for select using (true);

-- subscriptions: authenticated users manage only their own rows. Anonymous
-- subscribe/unsubscribe goes through service-role API routes.
drop policy if exists "Users can view their own subscriptions" on "public"."newsletter_subscriptions";
create policy "Users can view their own subscriptions" on "public"."newsletter_subscriptions" for select using ("user_id" = "auth"."uid" ());
drop policy if exists "Users can update their own subscriptions" on "public"."newsletter_subscriptions";
create policy "Users can update their own subscriptions" on "public"."newsletter_subscriptions" for update using ("user_id" = "auth"."uid" ());
drop policy if exists "Users can delete their own subscriptions" on "public"."newsletter_subscriptions";
create policy "Users can delete their own subscriptions" on "public"."newsletter_subscriptions" for delete using ("user_id" = "auth"."uid" ());
