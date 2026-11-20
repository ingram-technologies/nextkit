---
"@ingram-tech/nk-auth": minor
---

The auth chain's entity ids are `uuid`, and `publicSessionIds` covers every session-returning endpoint.

- **New migration `0005_uuid_ids`.** Every id and id-referencing column the chain created moves from `text` to `uuid` with a `uuidv7()` default (PostgreSQL 18): `user.id`, `session.id` / `userId`, `account.id` / `userId`, `verification.id`, `jwks.id`, `passkey.id` / `userId`, and the `oauth*` tables' `id`, `userId`, `sessionId` and `refreshId`. Provider subjects (`account.accountId`), `passkey.credentialID`, verification identifiers, tokens and OAuth client ids stay `text`. Any column of a site's own tables holding a foreign key to a converted column is converted with it (transitively), its foreign key re-created from its own definition. Before changing anything it refuses, naming each `table.column` and row count, if a value is not a uuid, or if a view, rule, policy or trigger depends on one of those columns. Row and value counts are asserted after the rewrite; it all runs in one transaction.
- **Better Auth must let the database mint ids:** `advanced: { database: { generateId: "uuid" } }`, replacing `uuidGenerateId` / `false`. Only that strategy shapes Better Auth's deterministic single-use ids (magic-link / email-OTP account promotion, OAuth client assertions) as uuids. `createAuthHelpers` throws the new `AuthIdStrategyError` on the first session read when the database records the whole chain and the instance says otherwise.
- `publicSessionIds` now also rewrites `/sign-in/social` (the `idToken` sign-in), `/sign-in/email-otp`, `/sign-in/username`, `/sign-in/phone-number`, `/sign-in/anonymous`, `/update-session`, `/verify-email`, `/change-password`, `/email-otp/verify-email`, `/phone-number/verify`, `/one-tap/callback`, `/one-time-token/verify`, `/siwe/verify`, the two-factor `verify-*` endpoints, the multi-session endpoints and the admin plugin's user and session endpoints (`session.impersonatedBy` included). The admin endpoints take a public `usr_` id (`userId`, or `id` on `/admin/get-user`) and refuse a raw one with a 400.

**Site migration order, on every database the site has:**

1. Bump `@ingram-tech/nk-auth`, set `generateId: "uuid"`, and remove the text-id workarounds: the `userIdColumn` helper (use `idColumn("user")` from `@ingram-tech/nk-db/id/drizzle`), `::uuid` / `::text` casts on user ids, text copies of the user id. A site whose own applied migrations declare `user_id text references "user"(id)` re-baselines those declarations to `uuid` in the same release (edit, `nk migrations --reseal`), because a fresh database now creates `"user".id` as uuid before the site chain runs.
2. `db:migrate` against the target database: the auth chain first (`nk-pg-migrate --migrations node_modules/@ingram-tech/nk-auth/migrations --table __nkauth_migrations`), then the site chain (`nk-pg-migrate`, or `nk-pg-migrate --baseline` for a site that re-baselined in step 1).
3. Deploy.

See the README, "Upgrading to uuid ids (0005)".
