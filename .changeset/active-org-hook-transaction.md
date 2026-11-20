---
"@ingram-tech/nk-auth": patch
---

`lastActiveOrganizationHooks`: `session.create.before` now reads through Better Auth's adapter, joining the transaction it runs in, instead of a second pool connection. Sign-up no longer deadlocks on a one-connection pool or on PGlite.
