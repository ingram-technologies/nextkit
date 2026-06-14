# @ingram-tech/nk-db

## 0.2.0

### Minor Changes

- PGlite harness: add an `extensions` option (forwarded to `PGlite.create`) so apps
  whose migrations `CREATE EXTENSION` contrib modules — e.g. `pg_trgm`, `vector` —
  can boot the dev/test database. Also loosen `DATABASE_SSL` parsing in `keys.ts`:
  `dbEnv()` now tolerates libpq-style values (`disable`, `require`, …) instead of
  throwing, since `createPool` decides TLS from the CA cert + host and never reads
  this flag.

## 0.1.0

- Initial release: TLS-aware `createPool`, raw-SQL `createQueries`
  (query/one/maybeOne/execute/withTx), Drizzle `createDb`, the `keys.ts` env
  contract, and the PGlite (no-Docker) dev/test harness (`nk-pglite-dev` bin +
  `createTestDb`).
