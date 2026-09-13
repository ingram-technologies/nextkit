---
"@ingram-tech/nk-auth": minor
---

Better Auth 1.7.4, and the guards that keep package and schema together.

- **`0003_better_auth_1_7_3`** relaxes the 1.7 account identity constraint 0002 set: the `(issuer, accountId)` unique index and the NOT NULL on `account.issuer` are dropped. Better Auth 1.7.3 reverted issuer-scoped identity (accounts are keyed on `(providerId, accountId)` again, as in 1.6) and never writes the column, so 0002's constraint rejects every sign-up on 1.7.3+. The delta is safe under 1.7.2 too, so the order is migrate, then deploy. The column stays, nullable and unread; dropping it is a later optional delta.
- **`better-auth` and `@better-auth/passkey` are pinned to exactly `1.7.4`** in `peerDependencies`. A site pins the same exact version; `nk doctor` (nk-dev 0.17) fails on a differing pin or a range. Every Better Auth bump ships as an nk-auth release with its chain delta, never as a site-level change.
- **`createAuthHelpers` checks the chain once per process**, on the first session read: when the instance's `database` is a `pg` Pool and the database records the nk-auth chain, a journal behind the installed package throws the new `AuthChainNotAppliedError` naming the missing files, so "deployed before migrating" fails loudly instead of at a customer's sign-in. A site that owns the auth tables in its own baseline (no nk-auth journal) is skipped. `assertAuthChainApplied(pool)` is exported for `instrumentation.ts` or a health check; `chainCheck: false` opts out.
- The migration test now also lists every column the chain carries that the pinned Better Auth does not model, so a relic cannot accumulate unnoticed.
