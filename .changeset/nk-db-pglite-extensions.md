---
"@ingram-tech/nk-db": minor
---

PGlite harness: add an `extensions` option (forwarded to `PGlite.create`) so apps
whose migrations `CREATE EXTENSION` contrib modules — e.g. `pg_trgm`, `vector` —
can boot the dev/test database. Also loosen `DATABASE_SSL` parsing in `keys.ts`:
`dbEnv()` now tolerates libpq-style values (`disable`, `require`, …) instead of
throwing, since `createPool` decides TLS from the CA cert + host and never reads
this flag.
