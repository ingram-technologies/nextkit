-- @ingram-tech/nk-auth — Better Auth schema, hardened for RLS.
--
-- This is the BASELINE (0001) of nk-auth's own migration chain — an append-only
-- set of SQL files this package ships and versions, journaled independently of a
-- consuming site's `drizzle/` chain (see docs/db-package.md § "The nk-auth
-- migration chain"). It mirrors Better Auth's core tables (user / session /
-- account / verification), the `jwt` plugin's `jwks` table, and the `passkey`
-- plugin's `passkey` table, for the version of `better-auth` this package pins.
--
-- Upgrading better-auth: this file is APPEND-ONLY. Once shipped it must never be
-- rewritten — the runner hashes each file and a changed baseline drifts every
-- site that already applied it. When a better-auth upgrade changes the schema,
-- diff it against the pinned version with:
--     npx @better-auth/cli generate
-- and land the delta as a NEW file (0002_*.sql, …) plus a `meta/_journal.json`
-- entry, written as idempotent `... if not exists` DDL and re-applying the two
-- hardening steps below to any new table. Never edit 0001.
--
-- TWO hardening steps the generator does NOT produce, both required:
--   1. New users default to a UUID id, because `auth.uid()`-style RLS policies
--      cast the JWT `sub` to `uuid`. A non-UUID id silently breaks RLS for new
--      signups.
--   2. Deny-all RLS on every Better Auth table — defense in depth. Better Auth
--      itself reaches them through its own privileged DATABASE_URL connection,
--      which bypasses RLS, so denying the app's RLS role any access here costs
--      nothing and keeps the auth tables off-limits to user-facing queries.

-- Statements below are separated by drizzle's per-statement breakpoint marker
-- (a plain SQL line comment). It is REQUIRED: the PGlite dev/test migrator parses
-- one statement per command and rejects a multi-statement string, so the runner
-- splits the file on that marker. Keep one statement per segment when appending
-- deltas — and never write the literal marker token inside prose like this, or
-- the splitter will cut here.

create table if not exists "public"."user" (
	"id" text primary key default gen_random_uuid()::text, -- hardening (1)
	"name" text not null,
	"email" text not null unique,
	"emailVerified" boolean not null default false,
	"image" text,
	"createdAt" timestamptz not null default now(),
	"updatedAt" timestamptz not null default now()
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
create table if not exists "public"."verification" (
	"id" text primary key,
	"identifier" text not null,
	"value" text not null,
	"expiresAt" timestamptz not null,
	"createdAt" timestamptz not null default now(),
	"updatedAt" timestamptz not null default now()
);
--> statement-breakpoint
-- `jwt` plugin: holds the asymmetric keypair used to sign session JWTs.
create table if not exists "public"."jwks" (
	"id" text primary key,
	"publicKey" text not null,
	"privateKey" text not null,
	"createdAt" timestamptz not null default now()
);
--> statement-breakpoint
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
--> statement-breakpoint
create index if not exists "idx_session_userId" on "public"."session" ("userId");
--> statement-breakpoint
create index if not exists "idx_account_userId" on "public"."account" ("userId");
--> statement-breakpoint
create index if not exists "idx_passkey_userId" on "public"."passkey" ("userId");
--> statement-breakpoint
create index if not exists "idx_verification_identifier" on "public"."verification" ("identifier");
--> statement-breakpoint
-- Hardening (2): deny-all RLS. No policies = no anon/authenticated access.
-- Better Auth's privileged connection bypasses RLS, so auth still works.
alter table "public"."user" enable row level security;
--> statement-breakpoint
alter table "public"."session" enable row level security;
--> statement-breakpoint
alter table "public"."account" enable row level security;
--> statement-breakpoint
alter table "public"."verification" enable row level security;
--> statement-breakpoint
alter table "public"."jwks" enable row level security;
--> statement-breakpoint
alter table "public"."passkey" enable row level security;
