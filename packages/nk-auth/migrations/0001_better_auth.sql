-- @ingram-tech/nk-auth — Better Auth schema for Supabase, hardened for RLS.
--
-- This mirrors Better Auth's core tables (user / session / account /
-- verification), the `jwt` plugin's `jwks` table, and the `passkey` plugin's
-- `passkey` table, for the version of `better-auth` this package depends on.
-- Reconcile against the exact pinned version with:
--     npx @better-auth/cli generate
-- and re-run after upgrading better-auth.
--
-- TWO hardening steps the generator does NOT produce, both required (see
-- docs/better-auth-migration.md):
--   1. New users default to a UUID id, because Supabase's auth.uid() casts the
--      JWT `sub` to `uuid`. A non-UUID id silently breaks RLS for new signups.
--   2. Deny-all RLS on every Better Auth table. They live in `public` and are
--      exposed by PostgREST; Better Auth itself reaches them through its own
--      privileged DATABASE_URL connection, which bypasses RLS, so denying anon /
--      authenticated access here costs nothing and closes the leak.

create extension if not exists "pgcrypto" with schema "extensions";

create table if not exists "public"."user" (
	"id" text primary key default gen_random_uuid()::text, -- hardening (1)
	"name" text not null,
	"email" text not null unique,
	"emailVerified" boolean not null default false,
	"image" text,
	"createdAt" timestamptz not null default now(),
	"updatedAt" timestamptz not null default now()
);

create table if not exists "public"."session" (
	"id" text primary key,
	"expiresAt" timestamptz not null,
	"token" text not null unique,
	"ipAddress" text,
	"userAgent" text,
	"userId" text not null references "public"."user" ("id") on delete cascade,
	"createdAt" timestamptz not null default now(),
	"updatedAt" timestamptz not null default now()
);

create table if not exists "public"."account" (
	"id" text primary key,
	"accountId" text not null,
	"providerId" text not null,
	"userId" text not null references "public"."user" ("id") on delete cascade,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamptz,
	"refreshTokenExpiresAt" timestamptz,
	"scope" text,
	"password" text,
	"createdAt" timestamptz not null default now(),
	"updatedAt" timestamptz not null default now()
);

create table if not exists "public"."verification" (
	"id" text primary key,
	"identifier" text not null,
	"value" text not null,
	"expiresAt" timestamptz not null,
	"createdAt" timestamptz not null default now(),
	"updatedAt" timestamptz not null default now()
);

-- `jwt` plugin: holds the asymmetric keypair used to sign the RLS bridge token.
create table if not exists "public"."jwks" (
	"id" text primary key,
	"publicKey" text not null,
	"privateKey" text not null,
	"createdAt" timestamptz not null default now()
);

-- `passkey` plugin.
create table if not exists "public"."passkey" (
	"id" text primary key,
	"name" text,
	"publicKey" text not null,
	"userId" text not null references "public"."user" ("id") on delete cascade,
	"credentialID" text not null,
	"counter" integer not null,
	"deviceType" text not null,
	"backedUp" boolean not null,
	"transports" text,
	"aaguid" text,
	"createdAt" timestamptz default now()
);

create index if not exists "idx_session_userId" on "public"."session" ("userId");
create index if not exists "idx_account_userId" on "public"."account" ("userId");
create index if not exists "idx_passkey_userId" on "public"."passkey" ("userId");
create index if not exists "idx_verification_identifier" on "public"."verification" ("identifier");

-- Hardening (2): deny-all RLS. No policies = no anon/authenticated access.
-- Better Auth's privileged connection bypasses RLS, so auth still works.
alter table "public"."user" enable row level security;
alter table "public"."session" enable row level security;
alter table "public"."account" enable row level security;
alter table "public"."verification" enable row level security;
alter table "public"."jwks" enable row level security;
alter table "public"."passkey" enable row level security;
