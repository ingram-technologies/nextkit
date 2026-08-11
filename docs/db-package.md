# The `@ingram-tech/nk-db` package: Postgres, Drizzle, and PGlite dev

Design + decision record for `@ingram-tech/nk-db`, the Ingram Postgres data
layer. **Usage — install, env vars, the app barrel, RLS how-to, PGlite dev/test,
gotchas — lives in [`packages/nk-db/README.md`](../packages/nk-db/README.md)**;
this doc records the decisions and their reasoning. Read
[`philosophy.md`](./philosophy.md) (vendor stance + Django-app model) first.

## Why this package exists

Every database-backed site needs the same three things: a TLS-aware `pg.Pool`,
`query<T>()`/`one`/`maybeOne`/`execute` helpers over it, and a local dev
database. nk-db is the one shared copy of all three — the
[single-source-of-truth](./philosophy.md#single-source-of-truth-propagated)
answer to near-identical, separately-maintained `src/lib/db/` layers. Sites get
the pool, the helpers, the Drizzle wiring, and the PGlite harness on a version
bump.

It also owns **the** connection pool. The rule is one `pg.Pool` per process,
reused for everything including Better Auth: the canonical pool lives here and
`nk-auth` consumes it by injection (see
[Relationship to nk-auth](#relationship-to-nk-auth)).

## What it is (and is not)

- It **is** infrastructure: the pool, the query helpers, the Drizzle factory,
  the migration runner, the dev/test harness, and the env contract for the
  database connection.
- It is **not** a stateful package — it owns no tables and ships no migrations.
  Apps (and stateful packages like `@ingram-tech/nk-marketing`) own their
  schema via Drizzle; this package just gives them the connection to run it on.
- It holds to the [prime directive](./philosophy.md#the-prime-directive-stay-indistinguishable-from-plain-nextjs):
  a consuming site uses plain `drizzle-orm` and plain `pg`. We ship the wiring,
  not a wrapper around them.

## Module groups

Three groups, split by subpath so production bundles stay clean (concrete API
in the [README](../packages/nk-db/README.md)):

- **Runtime** (the main `.` entry): the pool (`createPool`, TLS-aware), the raw
  query helpers (`createQueries`, incl. `withTx`/`withRls`), the RLS wrappers
  (`withRlsTransaction`), the Drizzle factory (`createDb`), boundary coercions
  (`pgTimestampToIso`/`pgNumericToNumber`), pg-error inspection
  (`isPgError`/`isUniqueViolation`), id helpers (`uuidv7`, on the `./id`
  subpath too), and the env contract (`keys.ts`).
- **Migration runner** (`./migrate` subpath + the `nk-pg-migrate` bin):
  node-only (`pg` + fs + drizzle's migrator), never exported from the main
  entry, so a bundle that only runs queries never pulls it.
- **PGlite harness** (`./pglite` subpath + the `nk-pglite-dev` bin): the only
  place the optional PGlite peer deps are imported; dev/test-only. The
  `./pglite/reset` subpath is deliberately zero-import so an in-process
  consumer gets the TRUNCATE-reset logic without dragging in PGlite or the
  socket server.

`pg` and `drizzle-orm` are **peerDependencies** (one copy in the app);
`@electric-sql/pglite` and `@electric-sql/pglite-socket` are **optional** peers
apps add as `devDependencies` — they must never reach a production bundle.

## The env contract (`keys.ts`)

Env vars are external input, so `keys.ts` parses them with Zod and fails fast
at startup with one error listing everything wrong. Variable-by-variable usage
is in the [README](../packages/nk-db/README.md); the decisions:

- `DATABASE_URL` is a **direct Postgres** connection (session-mode pooler /
  `:5432`), never a REST proxy — prepared statements and `SET LOCAL` must work.
- `DATABASE_SSL` is **accepted for compatibility but inert**: only `"true"`
  sets the parsed flag, other libpq-style values are tolerated rather than
  rejected, and `createPool` never reads it — TLS behavior is decided by the
  URL host and `DATABASE_CA_CERT` (below).
- **Local detection wins over pulled env.** A pulled `.env` (e.g.
  `vercel env pull`) carries the production `DATABASE_POOL_MAX` /
  `DATABASE_CA_CERT`, but the local PGlite socket is single-connection and
  speaks no TLS — so a local `DATABASE_URL` forces no-TLS and `max: 1`
  regardless. An explicit `max` passed in code still applies.

TLS rules in `createPool`:

- `caCert` set → `ssl: { ca, rejectUnauthorized: true }` (`verify-full`).
- local host (`127.0.0.1`/`localhost`/`::1`) → no TLS, pool capped at `max: 1`.
- otherwise → TLS **without** chain verification (`rejectUnauthorized: false`);
  managed certs aren't in Node's trust store but the link is still encrypted.
  `sslmode` is stripped from the URL — `pg` ignores the `ssl` object when the
  URL carries SSL settings.

> **DO uses one account-wide CA** across clusters in a region, so an app that
> pins `DATABASE_CA_CERT` doesn't need it changed when it moves between clusters.

### Why `createPool` un-escapes `\n` in `DATABASE_CA_CERT`

`createPool` normalizes a literal `\n` in the CA cert to a real newline
(`normalizeCaCert`) before handing it to `pg`. This is deliberate, and it is
**not** the data layer papering over a malformed stored value — the stored value
is correct. The reasoning, because it looks like a layering violation at first
glance:

- **The cert at rest is fine.** A multiline PEM is stored with real newlines
  (Pulumi sets it via `readFileSync(...pem)` / a managed-DB `ca.certificate`
  output). At runtime the app's env hands `DATABASE_CA_CERT` back with real
  newlines, so the deployed app does `verify-full` correctly. There is nothing to
  fix at storage.
- **The `\n` is a transport artifact.** `vercel env pull` (and most `.env`
  serializers) collapse the multiline secret to one double-quoted line with `\n`
  escapes. `bash` does **not** expand `\n` inside double quotes, so a script that
  `source`s that file gets the literal two-character `\n`. The thing that's wrong
  is the *local load step*, not storage and not really nk-db.
- **Who hits it.** Only callers that source a pulled `.env` — the `nk-pg-migrate`
  runner, a CI job — feed OpenSSL a literal-`\n` PEM and hit "self-signed
  certificate in certificate chain" on the very cert the deployed app accepts.

Three honest options exist, not two:

1. **Un-escape in `createPool`** (chosen). Tolerant of both forms at the one
   chokepoint that consumes the cert; unblocks every caller at once.
2. **Load the pulled `.env` with a real parser** (the `dotenv` package expands
   `\n` inside double quotes) instead of `source`. Correct, but per-script /
   per-repo — it doesn't generalize across the fleet.
3. **Base64-encode the cert at rest, decode at consumption.** Survives every
   transport (Vercel pull, Docker, k8s secrets, CI stores) with zero newline
   ambiguity. The most principled, but the most invasive: it changes how *every*
   project + infra stores the value.

**The call: option 1, pragmatically.** `createPool` can't dictate how every
caller ships the secret, env-var newline mangling is transport-dependent and
endemic, and `replace(/\\n/g, "\n")` is a well-precedented PEM pattern (Firebase
admin, Google service-account keys, many pg/TLS setups). It is **provably safe
for PEM**: base64 plus the `BEGIN`/`END` lines never contain a literal
backslash-`n`, so the transform is idempotent and cannot corrupt a
genuinely-newlined cert.

**The honest caveat:** this does push a slightly leaky assumption into the data
layer — "any `\n` here is an escaping artifact". True today, but `createPool`
silently *normalizes* input rather than *demanding* correct input. If we ever
want this layer to stay strict, **option 3 (base64 at rest) is the cleaner
long-term answer** and would make the `normalizeCaCert` step unnecessary, because
then nobody is newline-juggling anywhere and the value is unambiguous end to end.

## The query layer: Drizzle first, raw SQL as the escape hatch

Per the [data-layer decision](./philosophy.md#the-vendor-stance-eu-first-self-hostable-no-per-seat-us-saas),
**Drizzle is the default.** It is schema-first, so `drizzle-kit generate`
produces the migrations — closing hand-written-SQL drift — and its typed queries
support our [no-`as`-casts rule](./code-style.md). It sits on the same
`pg.Pool`, so it composes with Better Auth and PGlite unchanged. The app-side
barrel (one pool shared by Drizzle, the raw helpers, and Better Auth, held on
`globalThis` on serverless so warm invocations reuse it) is shown in the
[README](../packages/nk-db/README.md).

The raw helpers (`createQueries(pool)`) stay for the SQL Drizzle is awkward at —
Postgres function calls (`select fn($1,…)`), `pgmq`-style queue draining,
`pg_trgm` search — not as a parallel query path.

### Validate the result instead of casting it (the `<T>` is a lie)

`query<Row>(…)` asserts the row shape at compile time and validates **nothing**
at runtime — it is an `as Row` on the wire, and DB rows are external input,
which the [no-`as`-casts rule](./code-style.md) says to validate with Zod. So
every raw helper takes an optional Zod **row schema** as its last argument; pass
it and you get parsed, typed rows instead of a cast. The schema doubles as the
coercion layer (`z.coerce.number()` for `numeric`, an ISO transform for
timestamps), so ad-hoc per-call-site mapping disappears. The omit-the-schema
overload keeps the `<T>` form working — purely additive.

The Drizzle RLS path has no such helpers — inside `withRlsTransaction`,
`tx.execute()` returns an untyped `{ rows }` — so the result-side
`parseRows` / `parseMaybeRow` / `parseOneRow(result, schema)` give it the same
validated/coerced result without wrapping Drizzle's builder.

### Inspecting Postgres errors (`isPgError` / `isUniqueViolation`)

`pg` puts the SQLSTATE on `error.code`, but wrappers re-throw with the original
nested under `.cause`, so a flat `err.code === '23505'` check silently misses
it. `isPgError(err, code)` walks the `.cause` chain; `isUniqueViolation(err)` is
the `23505` shorthand. Reach for `ON CONFLICT` first (see the pooled-connection
footgun under [PGlite](#pglite-dev--test-the-pglite-subpath)); use these only
where you genuinely must branch on the failure.

### Row-Level Security on a direct connection (`withRls` / `withRlsTransaction`)

A plain `pg`/Drizzle connection runs as the connection's role with **no request
claims**, so RLS is silently **bypassed** (privileged role) or **denies
everything** — nothing populates the claims a policy reads. nk-db ships the
transaction-scoped claims setup as a first-class helper so no app hand-rolls
it; usage examples are in the [README](../packages/nk-db/README.md). Design
notes:

- **Per-transaction, as the first statement:** `withRlsTransaction(db, claims,
  fn)` (Drizzle) and `withRls(claims, fn)` (raw, the sibling of `withTx`) open
  a transaction and set the `request.jwt.claims` GUC + `SET LOCAL ROLE` before
  anything else runs, so policies written against `auth.uid()` (i.e.
  `current_setting('request.jwt.claims') ->> 'sub'`) fire — existing
  `auth.uid()` policies need no changes.
- **It's pure Postgres**, so it behaves identically wherever the cluster lives.
  The one convention to carry is that `auth.uid()`/`auth.role()` live in the
  `auth` schema — two trivial functions to recreate on a fresh cluster
  (`sub`/`role` out of `request.jwt.claims`). This makes "keep RLS" a viable,
  portable alternative to app-layer `where owner_id = …`.
- **It sidesteps any JWKS bridge.** Setting the claims ourselves from the Better
  Auth session needs no third-party-auth registration and no JWKS issuer — the
  claims come straight from the session.
- **GUCs are transaction-local** (`is_local = true`): they reset at
  commit/rollback and never leak across pooled connections. Everything (GUC
  name, claims, role) is **bound, not interpolated** (`rlsPreamble` is the
  statement; exported for middleware that manages its own connection).
- **The caller owns two invariants** the library can't enforce: connect as a
  role that doesn't bypass RLS for user rows (not owner/superuser), and grant
  that role `SET ROLE` to the target. Service-role paths keep using plain
  `db`/`query`.
- **`role` resolves** as `options.role ?? claims.role ?? "authenticated"`, so a
  DO app role (`app_user`) can differ from the JWT `role` claim.

### Boundary coercions instead of global type parsers

`pg` surfaces some columns in a form a strict response/validation schema
rejects: `timestamptz` as a JS `Date` (or, with Drizzle's
`timestamp(..., { mode: "string" })`, as Postgres' space-separated text form)
and `numeric` as a string. The decision is to coerce **at the read/response
boundary**, not to register global `pg.types.setTypeParser` overrides — a
process-wide parser silently changes every query's types, including Better
Auth's and Drizzle's own expectations. `coerce.ts` ships `pgTimestampToIso`
(which treats offset-less timestamps as UTC, so a `timestamp` without time zone
doesn't shift by host timezone) and `pgNumericToNumber`; for string timestamps
prefer Drizzle's `mode: "string"` per column. These are presentation
coercions — keep money math on the string/decimal value.

The `jsonb`-params quirk (stringify + `::jsonb` cast) is a usage gotcha; see
the [README](../packages/nk-db/README.md).

## Migrations: `runMigrations` / `nk-pg-migrate`

Apps keep migrations in `drizzle/`, generated by `drizzle-kit generate`. They
are **applied** by nk-db's own runner — `runMigrations` on the `./migrate`
subpath, wrapped by the `nk-pg-migrate` bin — invoked from a release/deploy
step, never imported at runtime (the subpath is node-only and not exported from
the main entry, so it never reaches a serverless bundle). The runner exists
because the stock drizzle-kit applier has recurring failure modes worth owning:

- **It surfaces the real Postgres error.** It uses drizzle-orm's own migrator,
  so a failing statement throws the actual database error instead of an opaque
  exit 1.
- **It pre-flights journal drift.** When a database's migration journal drifts
  from the `drizzle/` files (schema built via `db:push`, or a regenerated
  `0000` baseline), a blind replay dies with a confusing
  `relation "…" already exists`. `runMigrations` runs an `inspectMigrations`
  check first and throws a `MigrationDriftError` that explains what happened
  and how to fix it; `baselineMigrations` reconciles a journal whose schema is
  already correct without re-running any DDL.
- **It refuses to under-apply.** drizzle's migrator selects what to run with
  `when > max(created_at)` — a high-water mark. A migration whose journal
  timestamp lands *below* an already-applied one is therefore skipped, not
  recorded, and reported as success, and the gap is permanent. It isn't drift
  either: the recorded rows still match the files positionally, so a naive
  pre-flight passes. Two branches generating migrations and merging in the
  other order produce exactly this, as does a hand-edited `when`.
  `inspectMigrations` computes pending as a **set difference on hash** and
  flags anything the migrator can't reach; `runMigrations` throws
  `MigrationOrderError` rather than running a partial chain.

  The fix is to raise the stranded entry's `when` in `meta/_journal.json` above
  the newest applied one (and keep the journal's `when` values strictly
  increasing — the pre-flight asserts that, plus contiguous `idx`). That edits
  the journal, not the `.sql`, so the file hash every database recorded — and
  that [the seal](#the-seal-applied-migrations-are-immutable) pins — is
  unchanged. Fixed upstream in drizzle 1.0; this runner does not wait for it.
- **It serializes concurrent deploys** with `pg_advisory_lock` (drizzle's
  migrator takes no lock of its own), so two deploys racing the same cluster
  can't interleave DDL.

Journal rows are byte-compatible with drizzle's (`sha256` of the raw file, same
table/schema defaults), so the runner and drizzle tooling can be mixed freely.

### The seal: applied migrations are immutable

The runner records `sha256(file)` per migration, so a file's bytes become
history the moment any database applies it. Editing one afterwards — a
formatter sweeping the repo, a "quick fix" to a generated migration — drifts
every database that already ran it, and nothing in drizzle notices: it has
already recorded the old hash and will not look at the file again.

`nk migrations` (`@ingram-tech/nk-dev`) pins each file's hash in a committed
`drizzle/_seal.json`, so the edit fails the PR that made it instead of
surfacing as a confusing `already exists` on the next deploy. It needs no
database, so it runs in CI and on a laptop with no `DATABASE_URL`.

```bash
nk migrations            # verify, then seal newly generated migrations
nk migrations --check    # verify only — what `nk check` runs
nk migrations --reseal   # rewrite every hash: the squash escape hatch
nk migrations --ddl      # list migrations carrying DDL drizzle can't model
```

Generate a migration, run `nk migrations`, and commit `_seal.json` in the same
commit as the `.sql` — `nk check` fails on an unsealed migration, because a
seal that lands later seals whatever the file had already become.

### What `db:generate` does not see

`drizzle-kit generate` diffs `schema.ts` against `drizzle/meta/*_snapshot.json`.
It never reads the `.sql` files, and the snapshot models a **subset** of
Postgres: functions, triggers, `DEFERRABLE` constraints, grants, roles,
extensions and materialized views are all outside it. Two consequences that
have each cost a production incident in this fleet:

- **A clean `db:generate` proves nothing about the database.** It means
  `schema.ts` matches the snapshot. A baseline can lose an object (a squash
  dropping an enum value, say) and `db:generate` reports "no changes" forever
  after.
- **Anything regenerated from `schema.ts` drops the unmodelled clauses.** A
  hand-appended `DEFERRABLE INITIALLY DEFERRED` is invisible to drizzle, so the
  next generate that touches that constraint re-emits it *without* the clause —
  and a constraint that was checked at commit starts being checked
  mid-transaction. Same exposure for every function, trigger and grant.

**Treat these gaps as permanent.** Triggers and functions
([#843](https://github.com/drizzle-team/drizzle-orm/issues/843), open since
2023 with 555 reactions) and deferrable constraints
([#1429](https://github.com/drizzle-team/drizzle-orm/issues/1429)) are tracked
and untouched; grants aren't filed at all. The 1.0 release candidate models
views, roles and policies — and still has no `deferrable` on foreign keys and no
triggers module. Upgrading does not close the gap, so anything built here is
infrastructure, not a stopgap.

**Keep generated files purely generated.** Hand-appending unmodelled DDL to a
file `drizzle-kit generate` produced is what turns the snapshot from an
incomplete view into a wrong one: the snapshot describes that file's objects,
minus the clauses you added, and the next regenerate emits them without those
clauses. Put unmodelled DDL in `drizzle-kit generate --custom` migrations
instead, which drizzle records but does not claim to model.

`nk doctor` states which migrations carry unmodelled DDL rather than leaving it
to be rediscovered; `nk migrations --ddl` gives the per-file list. Treat that
list as the inventory a regenerated chain must be checked against **by hand**,
against a real database. Closing this properly needs a catalog-level diff
(`pg_class` / `pg_constraint.condeferrable` / `pg_proc` / `pg_trigger` /
`pg_policy` / grants) between a database built fresh from `drizzle/` and the
live one. nextkit does not ship that yet.

### Squashing a migration chain

Chains grow without bound, and a long one is a slow test harness and a wall of
irrelevant history. Squashing is supported — the constraint is that the new
`0000` must reproduce the live schema *exactly*, including everything drizzle
can't model. So the baseline body comes from **`pg_dump --schema-only` of
production**, never from `schema.ts`: a dump cannot structurally lose an object.

1. **Land any baseline cleanup as forward migrations first**, applied to
   production before the squash. Anything "cleaned up" in the new baseline that
   production still has becomes permanent drift.
2. **Regenerate data-seeding migrations from their source** and assert the rows
   match production. Chart/reference-data repairs later in the chain get
   dropped by the squash, and are only safe to drop if the source they
   regenerate from already reflects them.
3. **Build the new `0000`**: `pg_dump --schema-only` for the body, plus the
   hand-written bootstrap (extensions, schemas). **Roles are not in a schema
   dump** — re-add them by hand.
4. **Repoint the snapshots** so `0000`/`0001` describe the new baseline, and
   verify `db:generate` emits nothing.
5. **Gate before shipping**: diff the fresh-from-chain schema against
   production — every function, trigger, policy, grant, and
   `condeferrable` flag — and run the full suite. "The tests pass" is not the
   gate; the tests only cover what a test happens to exercise.
6. **Reseal and reconcile**: `nk migrations --reseal` (the changed hashes show
   up in the diff, which is the point), then `nk-pg-migrate --baseline` on every
   database that ran the old chain — production, demo, and any long-lived
   branch database. `--baseline` records the new chain without running DDL, so
   nothing gets rebuilt.

Step 5 is the one that makes the rest safe, and it is the step currently done by
hand. Until the catalog diff exists, squash rarely and treat the pre-ship
comparison as mandatory.

### The nk-auth migration chain

A site is not limited to one chain. The runner takes `migrationsFolder` +
`migrationsTable` per invocation, so an independently-versioned set of migrations
can be applied against its **own journal table** in the same database. nk-auth
uses this to **own its auth tables** (`user` / `session` / `account` /
`verification` / `jwks` / `passkey`, hardened for RLS): it ships an append-only
SQL chain in `packages/nk-auth/migrations/` — with a `meta/_journal.json` — and a
site applies it straight from `node_modules`, no copy-in:

```bash
# auth chain first (app tables FK to "user"), on its own journal table…
nk-pg-migrate --migrations node_modules/@ingram-tech/nk-auth/migrations --table __nkauth_migrations
# …then the app's own drizzle/ chain
nk-pg-migrate
```

This is the deliberate answer to "a better-auth upgrade that adds a column
becomes a hand-written migration in every site." It doesn't: the delta ships as a
new file in nk-auth's chain, so a site bumps the dependency and its next migrate
applies it. The cost, accepted on purpose: the auth DDL lives in a **dependency**
rather than the site's own `drizzle/` tree, and nk-auth's chain is **append-only**
— a shipped file is never rewritten (the runner hashes each file; a changed
baseline drifts every site that applied it), so upgrades land as `0002_*.sql`,
`0003_*.sql`, … Full rationale and the maintainer's upgrade flow are in
[`packages/nk-auth/README.md`](../packages/nk-auth/README.md#1-apply-the-schema).

Two chains sharing a schema **must** use distinct journal tables (nk-auth's is
`__nkauth_migrations`; the app default is `__drizzle_migrations`) or they collide.
The advisory lock serializes them regardless, so running both in one deploy step
is safe.

## PGlite dev & test (the `./pglite` subpath)

[PGlite](https://pglite.dev) is Postgres compiled to WASM, in-process: the
golden-path local database needs no Docker, no daemon, no external service.
**PGlite 0.5.x is PostgreSQL 18.3**, so `gen_random_uuid()`, `uuidv7()`,
plpgsql, and RLS all work and dev matches a pg18 prod target. (Probe the
version empirically on upgrade — the docs are vague.) The `nk-pglite-dev` bin
boots it persisted to `.pglite/`, applies migrations, exposes it via
`PGLiteSocketServer` on `127.0.0.1:5432` so the app's normal `pg.Pool` connects
through `DATABASE_URL` with no app-code changes, then execs `next dev`; the
test harness runs in-memory. Walkthroughs and the encoded gotchas
(single-connection socket → `max: 1`; `pg.Pool` destroys a connection on query
error, so unique-violation control flow is banned in favor of
`INSERT … ON CONFLICT`) are in the [README](../packages/nk-db/README.md).

`nk dev` runs the `nk-pglite-dev` bin when it resolves, else plain `next dev` —
orchestration only, per the
[`nk` carve-out](./philosophy.md#the-nk-carve-out-orchestration-never-interception);
command surface in [`packages/nk-dev/README.md`](../packages/nk-dev/README.md).

The harness applies the same [multi-chain model](#the-nk-auth-migration-chain)
locally, via `createPgliteServer`'s generic `dependencyMigrations` option (extra
journaled chains applied **before** the app's `drizzle/` folder). The harness
itself is package-agnostic — it never names nk-auth. The wiring lives one layer
up: `nk dev` resolves nk-auth's shipped migrations folder and passes it to
`nk-pglite-dev` as `--dep-migrations <folder>#<table>`, so the dependency graph
stays acyclic (nk-auth → nk-db, never the reverse) and local dev needs zero
per-site config. Test harnesses pass `dependencyMigrations` to `createTestDb`
directly (example in [nk-auth's README](../packages/nk-auth/README.md#1-apply-the-schema)).

## Relationship to nk-auth

`nk-auth` **takes the pool by injection** rather than creating its own —
`betterAuth({ database: pool, … })` with the pool from nk-db's `createPool` —
realizing "one pool, reused for everything including Better Auth".
`createAuthPool` in nk-auth is a `@deprecated` thin alias over `createPool`,
kept only so existing call sites keep working; new code imports from nk-db.
Better Auth needs prepared statements, so the pool must use a **direct
connection or session-mode pooling**, never transaction-mode pgbouncer.

nk-auth is also nk-db's one stateful consumer: it owns the auth tables and ships
them as its own [migration chain](#the-nk-auth-migration-chain), applied by this
package's runner against a separate journal table. nk-db stays generic — the
runner and the PGlite harness never name nk-auth; the wiring is injected from
above (`nk dev`, or a test harness).

## Enforcement (push it down the ladder)

Per [enforce-what-you-can](./philosophy.md#enforce-what-you-can-document-what-you-cant):

- **oxlint rule:** ban `new Pool(` / `new Client(` outside `src/lib/db.ts` —
  force the shared `createPool()`.
- **oxlint rule:** flag `=== '23505'` (and `.code === ` on caught pg errors) used
  as control flow — steer to `ON CONFLICT`, or to `isPgError` / `isUniqueViolation`
  for the cases that legitimately must branch on the failure (they also walk the
  `.cause` chain a flat check misses).
- **oxlint rule:** ban legacy hosted-backend data-access client imports once a
  site is on the golden path — force data access through nk-db.

## Decisions (locked)

- **Drizzle is the source of truth; raw SQL is the escape hatch.** Drizzle owns
  the schema, the generated migrations, and the row types. The
  `query/one/maybeOne/execute` helpers stay for SQL the ORM is awkward at
  (`select fn($1,…)` calls, `pgmq` draining, `pg_trgm`) — not as a parallel query
  path. They take an optional Zod **row schema** (validate + coerce the result
  instead of casting `<T>`); `parseRows`/`parseMaybeRow`/`parseOneRow` give the
  Drizzle `tx.execute()` path the same on the RLS side.
- **nk-db is mandatory for database-backed sites.** Products import
  `createPool` / `createDb` / `createQueries` from here instead of hand-rolling
  a `src/lib/db/` layer; that is the whole point of extracting this slice.
- **Default primary-key id: `uuidv7()`.** Align app tables with nk-auth's ids for
  index/B-tree locality (pg18 / PGlite both provide `uuidv7()`).
- **Prod migrations run via `runMigrations` / the `nk-pg-migrate` bin** from a
  release/deploy step — real-error surfacing, drift pre-flight
  (`MigrationDriftError` / `baselineMigrations`), and `pg_advisory_lock`
  serialization — never imported at app runtime. `drizzle-kit` stays a
  `devDependency` used only to *generate* migrations.
- **Transaction wrapper:** `createQueries` exposes `withTx` (no app hand-rolls
  `BEGIN/COMMIT`).
- **RLS on direct connections is first-class, not hand-rolled.** `withRls`
  (raw) and `withRlsTransaction` (Drizzle) own the `SET LOCAL ROLE` +
  `request.jwt.claims` setup. Keeping RLS (claims from the Better Auth session)
  and app-layer `where owner_id = …` are both supported; RLS is the lower-churn
  path when a site already has trusted policies. We do **not** depend on any
  third-party JWKS issuer for this — claims come straight from the session (see
  the RLS notes above).
