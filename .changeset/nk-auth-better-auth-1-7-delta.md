---
"@ingram-tech/nk-auth": minor
---

Ship the Better Auth 1.7 schema delta as `migrations/0002_better_auth_1_7.sql`,
and require `better-auth` / `@better-auth/passkey` `^1.7.2`.

Until now the chain held only the 1.6 baseline, so a site on better-auth 1.7 ran
against a schema missing what 1.7 reads and writes: the `account.issuer` column
it now keys accounts on (`(issuer, accountId)` unique), and the `jwks`
key-rotation columns (`expiresAt`, `alg`, `crv`). 0002 adds them and backfills
`issuer` on every pre-1.7 account row with exactly the value 1.7.2 writes for
that provider (`local:credential`, `https://accounts.google.com`,
`local:oauth:<providerId>`, …), so returning OAuth users keep their identity. A
provider whose issuer is per-tenant or discovered at runtime (`microsoft`,
`cognito`, `paybin`, generic-oauth) cannot be derived: the migration then raises
naming the `providerId`s and rolls back — set `issuer` on those rows by hand and
re-run. A site with password + built-in social sign-in has nothing to do beyond
bumping and running its usual `db:migrate`.

The migration test is now the deploy gate this exists for: it diffs the applied
chain against `getAuthTables()` of the pinned better-auth, and proves 0002
against a database seeded at 0001 through the real `nk-pg-migrate` runner.
