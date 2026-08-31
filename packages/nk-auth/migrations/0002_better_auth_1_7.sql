-- @ingram-tech/nk-auth — Better Auth 1.7 schema delta (better-auth ^1.7.2).
--
-- Better Auth 1.7 keys an account on (issuer, accountId) instead of
-- (providerId, accountId): every account row now carries the identity
-- namespace it was verified under, and all OAuth sign-in / linking lookups go
-- through that pair (`findAccountOwnerByKey`, `findAccountByKey`). The `jwt`
-- plugin also gained key rotation, which needs three nullable columns on `jwks`.
--
-- The rows that exist before this file runs were written by 1.6, which never
-- populated `issuer`, so this delta BACKFILLS it with exactly the value 1.7.2
-- would have written for that provider — otherwise every returning OAuth user
-- looks like a new identity. The rules, read off better-auth 1.7.2 itself:
--   - `credential` (email + password, and the otp / phone / admin plugins) →
--     `local:credential` (core's createLocalAccountIssuer).
--   - A built-in social provider that declares a fixed `accountIssuer` → that
--     issuer verbatim (google, apple, facebook, line).
--   - Any other built-in social provider → `local:oauth:<providerId>` (core's
--     createOAuthAccountIssuer; the ids are plain slugs, so percent-encoding is
--     the identity).
-- Providers whose issuer is per-tenant or discovered at runtime (microsoft →
-- the token's `iss`, cognito → the user pool URL, paybin, the generic-oauth
-- plugin) cannot be derived here, so the migration REFUSES to guess: it raises
-- naming the unmapped providerIds and rolls back. Backfill those by hand with
-- the issuer your provider config resolves to, then re-run the migrate.
--
-- The unique index is what 1.7 relies on for account identity. If it fails to
-- build, the database already holds two accounts for one (issuer, accountId)
-- pair — resolve those duplicates rather than dropping the index.
--
-- Append-only: this file is hashed by the runner and must never be edited once
-- shipped. The next better-auth schema change goes in 0003.

alter table "public"."account" add column if not exists "issuer" text;
--> statement-breakpoint
update "public"."account" set "issuer" = case "providerId"
	when 'credential' then 'local:credential'
	when 'google' then 'https://accounts.google.com'
	when 'apple' then 'https://appleid.apple.com'
	when 'facebook' then 'https://www.facebook.com'
	when 'line' then 'https://access.line.me'
	when 'atlassian' then 'local:oauth:atlassian'
	when 'discord' then 'local:oauth:discord'
	when 'dropbox' then 'local:oauth:dropbox'
	when 'figma' then 'local:oauth:figma'
	when 'github' then 'local:oauth:github'
	when 'gitlab' then 'local:oauth:gitlab'
	when 'huggingface' then 'local:oauth:huggingface'
	when 'kakao' then 'local:oauth:kakao'
	when 'kick' then 'local:oauth:kick'
	when 'linear' then 'local:oauth:linear'
	when 'linkedin' then 'local:oauth:linkedin'
	when 'naver' then 'local:oauth:naver'
	when 'notion' then 'local:oauth:notion'
	when 'paypal' then 'local:oauth:paypal'
	when 'polar' then 'local:oauth:polar'
	when 'railway' then 'local:oauth:railway'
	when 'reddit' then 'local:oauth:reddit'
	when 'roblox' then 'local:oauth:roblox'
	when 'salesforce' then 'local:oauth:salesforce'
	when 'slack' then 'local:oauth:slack'
	when 'spotify' then 'local:oauth:spotify'
	when 'tiktok' then 'local:oauth:tiktok'
	when 'twitch' then 'local:oauth:twitch'
	when 'twitter' then 'local:oauth:twitter'
	when 'vercel' then 'local:oauth:vercel'
	when 'vk' then 'local:oauth:vk'
	when 'wechat' then 'local:oauth:wechat'
	when 'zoom' then 'local:oauth:zoom'
end where "issuer" is null;
--> statement-breakpoint
do $$
declare
	unmapped text;
begin
	select string_agg(distinct "providerId", ', ') into unmapped
	from "public"."account" where "issuer" is null;
	if unmapped is not null then
		raise exception 'nk-auth 0002_better_auth_1_7: cannot derive account.issuer for providerId(s): %. Better Auth 1.7 keys accounts on (issuer, accountId) and these providers use a per-tenant or discovered issuer this migration cannot know. Set "issuer" on those rows by hand (the value your provider config resolves to), then re-run the migrate.', unmapped;
	end if;
end $$;
--> statement-breakpoint
alter table "public"."account" alter column "issuer" set not null;
--> statement-breakpoint
create unique index if not exists "account_issuer_accountId_uidx" on "public"."account" ("issuer", "accountId");
--> statement-breakpoint
-- `jwt` plugin key rotation (1.7): per-key expiry + the algorithm/curve the
-- JWKS endpoint advertises. Nullable — a pre-rotation key falls back to the
-- plugin's configured defaults.
alter table "public"."jwks" add column if not exists "expiresAt" timestamptz;
--> statement-breakpoint
alter table "public"."jwks" add column if not exists "alg" text;
--> statement-breakpoint
alter table "public"."jwks" add column if not exists "crv" text;
