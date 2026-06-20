# @ingram-tech/nk-db

## 0.4.0

### Minor Changes

- fdb7983: Add RLS-aware access for direct connections: `withRlsTransaction` (Drizzle) and
  `withRls` (raw, sibling of `withTx`). They open a transaction and set
  `request.jwt.claims` + `SET LOCAL ROLE` (default `authenticated`) before running
  your callback, reproducing what PostgREST did — so existing `auth.uid()` policies
  keep working on a direct `pg`/Drizzle connection, with claims taken straight from
  the Better Auth session (no JWT minting, no JWKS issuer). GUCs are
  transaction-local, so they don't leak across pooled connections. Also exports the
  building blocks `resolveRlsConfig`, `rlsPreamble`, `RlsClaims`, `RlsOptions`, and
  the `RLS_DEFAULT_ROLE` / `RLS_CLAIMS_SETTING` constants. Purely additive.

## 0.3.0

### Minor Changes

- 5e2c767: Export `resetPublicTables` from a new `@ingram-tech/nk-db/pglite/reset` subpath —
  the canonical "introspect public tables + TRUNCATE … RESTART IDENTITY CASCADE"
  test-reset, transport-agnostic so an in-process Drizzle/PGlite harness can share
  it without pulling in PGlite or the socket server. `createTestDb`'s `reset()` now
  delegates to it (behaviour unchanged). The subpath is deliberately zero-import so
  in-process consumers don't pay for the socket transport.

### Patch Changes

- 5e1fab2: Raise the optional `@electric-sql/pglite-socket` peer floor to `>=0.2.4` to track
  the current release. Affects only the no-Docker PGlite dev/test harness, not the
  production pg path.

## 0.2.1

### Patch Changes

- Fix ESM packaging: relative re-exports in the compiled output now carry `.js`
  extensions, so the main entry resolves under strict Node ESM (Vitest / `node`),
  not only bundlers. Surfaced by a consumer importing `@ingram-tech/nk-db` from a
  Vitest suite.

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
