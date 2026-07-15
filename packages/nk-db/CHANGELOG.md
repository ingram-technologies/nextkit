# @ingram-tech/nk-db

## 1.4.0

### Minor Changes

- 8333445: `@ingram-tech/nk-db/id`: `uuidGenerateId` now returns the branded `Uuid` type
  (still a plain string at runtime), and two new helpers ship the sanctioned
  string→`Uuid` bless for trust boundaries: `isUuid` (narrowing guard, accepts
  any RFC 9562 version) and `asUuid` (the throwing variant). Together they let
  sites brand their Drizzle uuid columns (`.$type<Uuid>()`) so a raw uuid can no
  longer be cast into a public `Id<E>` slot (or vice versa) without the compiler
  objecting.
- 30668e6: **The id codec is now isomorphic.** `uuidGenerateId` used `node:crypto`'s
  `randomBytes`, which made the whole of `@ingram-tech/nk-db/id` node-only even
  though only minting needed it — every module touching an id inherited that, so a
  Drizzle `schema.ts` could not encode/decode without risking `node:crypto` in a
  client bundle, and sites resorted to dependency-injecting the codec around their
  schema. Randomness now comes from Web Crypto (a global on Node 19+, Bun, Deno,
  edge, browsers). `id.ts` has zero imports, and a test keeps it that way.

  **`exports` now resolve under CJS.** Every subpath declared only an `"import"`
  condition, so any CJS resolver failed with `ERR_PACKAGE_PATH_NOT_EXPORTED` —
  including **drizzle-kit**, which meant a `schema.ts` importing
  `@ingram-tech/nk-db/id` broke `drizzle-kit generate`. The conditions are now
  `"default"`, which resolves under both `import` and `require`.

  **New: `entityOf(registry, value)` / `decodeAnyId(registry, value)`.** A public
  id is self-describing — its prefix names its entity — so it can be resolved with
  no surrounding context. That is the primitive behind polymorphic FK decoding,
  raw-SQL id binding, and generic event payloads. Sites were hand-rolling the loop
  over `decodeOrNull`.

  **New subpath: `@ingram-tech/nk-db/id/drizzle`** — `createIdColumns(registry)`
  returns `idColumn(entity)` / `polymorphicIdColumn` (a `customType` whose
  `toDriver` decodes a skinned id before it reaches Postgres, on WHERE values as
  well as insert/update SET) plus `sqlUuid` / `sqlUuidArray` for the raw-SQL and
  RPC args the column layer cannot reach. `dataType` stays `uuid`, so adopting it
  needs no DDL and produces no `drizzle-kit` diff. It pulls only `drizzle-orm` and
  the codec, never `pg`, because it is imported by `schema.ts`.

## 1.3.1

### Patch Changes

- af5209d: `createPool` no longer throws when no connection string is configured — it
  returns a pool that constructs cleanly and defers the "set DATABASE_URL" error
  to first use. Constructing the pool happens at module load in every app's
  `lib/db`, so importing that module (and therefore `next build` collecting page
  data, a unit test, or a CLI tool that never queries) must stay side-effect-free;
  a hard throw at construction broke DB-less builds. A process that then runs a
  real query without a URL still fails fast and legibly — the env is fixed at
  process start, so this is never a transient miss. The deferred rejection is
  async (a macrotask, like real connection I/O) so Next.js partial prerendering
  sees a pending promise and postpones the segment, instead of a synchronous
  render error. A present-but-invalid `DATABASE_URL` still throws eagerly.

## 1.3.0

### Minor Changes

- 637972f: `createIdRegistry` now returns entity-branded helpers. `mint()`/`encode()` return `Id<E>` (branded by the registry key, e.g. `Id<"org">`), `decode()`/`decodeOrNull()` return a distinct `Uuid` brand, and `is()` narrows to `Id<E>`. New `Id<E>` and `Uuid` types are exported. This makes two silent bug classes compile errors: mixing ids of different entities (`org` vs `agent`), and feeding a skinned public id into a raw-uuid slot (or vice versa). The brands are erased at runtime and both are assignable to `string`, so this is backward-compatible — existing call sites keep compiling. Deliberately untyped input opts out with `x as Id<"...">` / `x as Uuid`.

## 1.2.0

### Minor Changes

- c4eeaeb: Migration, pool, and coercion safety fixes:

  - **`runMigrations` is now concurrency-safe.** The whole run (drift pre-flight + migrate) executes on one client holding `pg_advisory_lock` — drizzle's migrator takes no lock of its own, so two concurrent deploys could both apply the same pending set and leave duplicate journal rows (permanent `MigrationDriftError`). The second runner now blocks, then no-ops. `applied` is computed inside the lock, so it reports what the run actually did.
  - **PGlite dev applies new migrations on every boot.** Previously migrations ran only when the `.pglite/` data dir didn't exist, so any migration added after the first boot was silently skipped until a data-wiping `--fresh`. The drizzle migrator is journal-tracked, so re-running is incremental and cheap; a custom `migrate` override must be idempotent the same way.
  - **Local detection wins over pulled env.** A `vercel env pull`'d `DATABASE_POOL_MAX`/`DATABASE_CA_CERT` no longer overrides the mandatory `max: 1` / no-TLS for a local (PGlite) connection — the exact dev breakage the local branch exists to prevent. `isLocal` also parses the URL hostname instead of substring-matching the whole connection string.
  - **`withTx`/`withRls` no longer mask the real error** when the failing query destroyed the connection and the rollback itself rejects.
  - **`pgTimestampToIso` treats offset-less timestamps as UTC.** `timestamp without time zone` text (the very columns the helper exists for) was parsed in the host's local zone, shifting the instant on any non-UTC machine.
  - Hardening: `decode58` rejects 22-char bodies that overflow 128 bits instead of silently aliasing two wire ids to one UUID; `isPgError` caps `.cause`-chain depth so a cyclic chain can't hang; the journal file is Zod-validated; `resetPublicTables` escapes quotes in table names; `nk-pg-migrate --migrations` without a value errors instead of eating the next flag; `startPgliteDev` handles a failed `next dev` spawn and validates `PGLITE_PORT`.

## 1.1.0

### Minor Changes

- f14fdc4: Add `decodeOrNull` to the `createIdRegistry` id helpers — the throw-free
  counterpart to `decode`, returning `null` for a foreign or malformed prefixed
  id. Lets routes validate an untrusted path/query id without a try/catch
  (`ids.org.decodeOrNull(param) ?? notFound()`). Additive; existing helpers
  unchanged.

## 1.0.0

### Major Changes

- beb294e: Drop Supabase-era compatibility. **Breaking:**

  - **Connection string is `DATABASE_URL` only.** The `POSTGRES_URL_NON_POOLING`
    and `POSTGRES_URL` fallbacks (the Supabase integration's autopopulated vars)
    are no longer read by `getDatabaseUrl` / `dbEnv`. Set `DATABASE_URL`.
  - **Removed `configureTimestampsAsStrings()`** (and the `./types` module). It was
    a shim for Supabase-generated row types that declared timestamps as `string`.
    On the golden path, express this per-column with Drizzle's
    `timestamp(..., { mode: "string" })`; the `pgTimestampToIso` /
    `pgNumericToNumber` response-boundary coercions remain for strict schemas.

  No behavioral change to the pool, RLS helpers, or queries — only doc comments
  were reworded to drop Supabase/PostgREST framing.

## 0.9.1

### Patch Changes

- d6710fd: `createPool` now un-escapes a CA cert that arrives with literal `\n` instead of
  real newlines, so verify-full TLS works regardless of how the env was loaded.

  A multiline `DATABASE_CA_CERT` survives intact in a deployed app's runtime env
  (Vercel hands it back with real newlines, so the app verifies fine), but
  `vercel env pull` — and most `.env` serializers — collapse it to one quoted line
  with `\n` escapes. A caller that sourced that file (the `nk-pg-migrate` runner, a
  CI job) hit OpenSSL's "self-signed certificate in certificate chain" on the very
  cert the app accepts. Normalising at the one point the cert reaches `pg` fixes
  every caller (including the `createAuthPool` alias). A correctly-newlined PEM
  contains no literal `\n`, so this is a no-op there — idempotent and safe. The
  helper is exported as `normalizeCaCert`.

## 0.9.0

### Minor Changes

- Add optional Zod row-schema validation to the raw query helpers, result-side parse helpers for the Drizzle path, and Postgres error inspectors.

  - `query` / `one` / `maybeOne` now accept an optional Zod **row schema** as a third argument. Pass it and the helper validates (and coerces) each row, returning `z.infer` of the schema instead of an unchecked `<T>` cast — DB rows are external input, and the schema doubles as the `numeric`/timestamp coercion layer (`z.coerce.number()`, an ISO transform). The no-schema overload is unchanged, so this is purely additive.
  - New `parseRows` / `parseMaybeRow` / `parseOneRow(result, schema)` validate the `rows` of a pg `QueryResult` or a Drizzle `tx.execute()` result. These give the RLS/Drizzle path (where `tx.execute()` returns an untyped `{ rows }`) the same validated/coerced result without wrapping Drizzle's query builder.
  - New `isPgError(err, code)` / `isUniqueViolation(err)` / `PG_UNIQUE_VIOLATION` walk the error `.cause` chain (which a flat `err.code === …` check misses) to inspect Postgres failures by SQLSTATE.

## 0.8.0

### Minor Changes

- Add `pgTimestampToIso` and `pgNumericToNumber` response-boundary coercion helpers.

  Direct `pg`/Drizzle surface `numeric` as a string (to preserve precision) and
  `timestamp(..., { mode: "string" })` as Postgres' own text form, neither of which
  satisfies a schema written against supabase-js (`z.number()` / strict
  `z.iso.datetime()`). These convert at the read/response boundary; they are
  presentation coercions, not domain math.

## 0.7.0

### Minor Changes

- 1c029cb: Add a drift-aware migration runner and stop the PGlite test harness colliding with a dev Postgres.

  **`@ingram-tech/nk-db/migrate` (+ `nk-pg-migrate` bin)** — a drop-in replacement for `drizzle-kit migrate` that fixes two recurring pains:

  - It uses drizzle-orm's own migrator, so a failing statement throws the **real Postgres error** instead of drizzle-kit's opaque exit 1.
  - It runs a pre-flight check and throws a clear `MigrationDriftError` (with remediation) when the DB's `__drizzle_migrations` journal is out of sync with the `drizzle/` files — the "schema built via db:push" / "0000 baseline regenerated" case that otherwise dies with a confusing `relation "..." already exists`.

  Exports `runMigrations`, `inspectMigrations`, `baselineMigrations` (reconcile a journal whose schema is already correct, no DDL re-run), `readJournal`, and `MigrationDriftError`. All accept a connection string (via the env contract / `createPool`) or an existing `pool`. The `nk-pg-migrate` bin supports `--status`, `--baseline`, and `--migrations <folder>`; set a site's `db:migrate` script to it.

  **PGlite test harness** — `createTestDb` now defaults to an **ephemeral free port** instead of `5432`, so the integration suite no longer dies with `EADDRINUSE` when a developer has a real Postgres running on 5432. Tests reach the db through the returned `pool`/`databaseUrl`, so the port is irrelevant; an explicit `port` or `PGLITE_PORT` still wins. `startPgliteDev` keeps the stable 5432 it needs.

## 0.5.0

### Minor Changes

- Add the Ingram id codec at `@ingram-tech/nk-db/id` — moved down from
  `@ingram-tech/nk-auth/id` (which now re-exports it) so a site can mint ids
  without pulling the auth slice. The subpath is `node:crypto`-only (no `pg` /
  `drizzle`). Exposes `uuidGenerateId`, `toPrefixedId`, `fromPrefixedId`,
  `base58Id`, and a new `createIdRegistry()` that builds typed, prefix-validated
  helpers (`mint` / `encode` / `decode` / `is`) for a project's entities. The
  cross-impl base58 vectors (Python twin in cloud.ingram.tech's `v1/core.py`)
  move with the codec and still guard the contract. Purely additive.

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
