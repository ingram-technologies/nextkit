-- @ingram-tech/nk-auth — Better Auth 1.7.3 schema delta (better-auth 1.7.4).
--
-- 1.7.3 reverted the 1.7.0-1.7.2 account identity change: accounts are keyed
-- on (providerId, accountId) again, exactly as in 1.6, and upstream has
-- committed to keeping the core schema fixed for the rest of v1. 1.7.3+ never
-- writes `account.issuer`, so the NOT NULL that 0002 set rejects every sign-up
-- and account link, and the (issuer, accountId) unique index would collapse
-- into uniqueness on `accountId` alone once the column is always null.
--
-- This relaxes both. It is safe under either package version: 1.7.2 keeps
-- writing `issuer` into a nullable column, 1.7.3+ ignores it. So a site
-- migrates first and deploys second with no window where sign-in fails.
--
-- The column itself stays. Dropping it breaks 1.7.2, which reads it on every
-- sign-in, so it can only go once no 1.7.2 code runs anywhere; that is a
-- separate later delta, and it is optional (1.7.3+ tolerates the extra
-- nullable column). A 1.6 database applies 0002 and this file back to back;
-- the backfilled value is then never read.
--
-- Append-only: this file is hashed by the runner and must never be edited once
-- shipped. The next better-auth schema change goes in 0004.

drop index if exists "public"."account_issuer_accountId_uidx";
--> statement-breakpoint
alter table "public"."account" alter column "issuer" drop not null;
