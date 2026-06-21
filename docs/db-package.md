# The `@ingram-tech/nk-db` package: Postgres, Drizzle, and PGlite dev

**Status:** shipped. `@ingram-tech/nk-db` is built and published; this doc is its
design + rationale. It extracts the data layer that several products each
hand-rolled during the Supabase→Postgres move into one versioned slice. Tier-B
adoption (replacing the hand-rolled `src/lib/db/` layers) is in progress. Read [`philosophy.md`](./philosophy.md) (vendor stance +
Django-app model) first.

## Why this package exists

Every product that moved off Supabase re-implemented the same three things:

1. A `src/lib/db/pool.ts` — one shared `pg.Pool` with the right TLS for managed
   Postgres.
2. A `src/lib/db/index.ts` — `query<T>()`, `one<T>()`, `maybeOne<T>()`,
   `execute()` helpers over that pool.
3. A `scripts/pglite-dev.ts` — boot Postgres-in-WASM for local dev, apply
   migrations, expose it on `127.0.0.1:5432`, persist to `.pglite/`.

They drifted immediately (different local-DB strategies — one stayed on Docker,
one had no local DB, others kept near-identical but separately-maintained
copies). This
is exactly the [single-source-of-truth](./philosophy.md#single-source-of-truth-propagated)
problem nextkit exists to solve. `@ingram-tech/nk-db` is the one copy; sites get the
pool, the helpers, the Drizzle wiring, and the PGlite harness on a version bump.

It also **consolidates the connection pool**. Today `@ingram-tech/nk-auth` ships
`createAuthPool` and the app's data layer creates a second pool. The playbook is
explicit: **one `pg.Pool`, reused for everything including Better Auth.** So the
canonical pool moves *here*, and `nk-auth` consumes it by injection (see
[Relationship to nk-auth](#relationship-to-nk-auth)).

## What it is (and is not)

- It **is** infrastructure: the pool, the query helpers, the Drizzle factory,
  the dev/test harness, and the env contract for the database connection.
- It is **not** a stateful package — it owns no tables and ships no migrations.
  Apps (and stateful packages like a future `@ingram-tech/newsletter`) own their
  schema via Drizzle; this package just gives them the connection to run it on.
- It holds to the [prime directive](./philosophy.md#the-prime-directive-stay-indistinguishable-from-plain-nextjs):
  a consuming site uses plain `drizzle-orm` and plain `pg`. We ship the wiring,
  not a wrapper around them.

## Package layout

```
packages/nk-db/
  package.json            # @ingram-tech/nk-db; peerDeps: pg, drizzle-orm
  README.md
  src/
    index.ts              # query/one/maybeOne/execute + re-exports
    pool.ts               # createPool(): the one shared pg.Pool (TLS-aware)
    drizzle.ts            # createDb(pool, schema): the Drizzle instance
    types.ts              # the timestamptz/jsonb type-parser setup
    keys.ts               # env contract (DATABASE_URL precedence, SSL, pool max)
    keys.test.ts
  pglite/
    dev.ts                # bin: nk-pglite-dev — boot PGlite for `next dev`
    test-setup.ts         # Vitest globalSetup + resetDb() for in-memory PGlite
  tsconfig.json
  vitest.config.ts
```

`pg` and `drizzle-orm` are **peerDependencies** (one copy in the app).
`@electric-sql/pglite` and `@electric-sql/pglite-socket` are **optional peer
deps** the app adds as `devDependencies` — they must never reach a production
bundle. The `./pglite` subpath is the only place they're imported, and it is
dev/test-only.

## The env contract (`keys.ts`)

`getDatabaseUrl()` resolves the connection in this precedence — the property that
let apps deploy the new code **while still pointed at Supabase Postgres**, before
any data moved:

1. `DATABASE_URL` — our DO cluster (or the local PGlite socket in dev).
2. `POSTGRES_URL_NON_POOLING` — Supabase integration's autopopulated direct URL.
3. `POSTGRES_URL` — Supabase integration's pooled URL.

| Var | Purpose |
| --- | --- |
| `DATABASE_URL` | direct Postgres (session-mode pooler / `:5432`, never PostgREST) |
| `DATABASE_SSL` | `"true"` to require TLS (managed hosts) |
| `DATABASE_CA_CERT` | PEM CA; when set, verify cert + hostname (`verify-full`) |
| `DATABASE_POOL_MAX` | pool cap; **small on serverless** (e.g. 5 on Vercel) |

TLS rules (carried over from `nk-auth`'s `createAuthPool`):

- `caCert` set → `ssl: { ca, rejectUnauthorized: true }`.
- local (`127.0.0.1`/`localhost`) → no TLS.
- otherwise → TLS **without** chain verification (`rejectUnauthorized: false`);
  managed certs aren't in Node's trust store but the link is still encrypted.
  Strip `sslmode` from the URL — `pg` ignores the `ssl` object when the URL
  carries SSL settings.

> **DO uses one account-wide CA** across clusters in a region, so an app that
> pins `DATABASE_CA_CERT` doesn't need it changed when it moves between clusters.

## The query layer: Drizzle first, raw SQL as the escape hatch

Per the [data-layer decision](./philosophy.md#the-vendor-stance-eu-first-self-hostable-no-per-seat-us-saas),
**Drizzle is the default.** It is schema-first, so `drizzle-kit` *generates* the
migrations — closing the hand-written-SQL drift the playbook repeatedly got
burned by — and its typed queries support our [no-`as`-casts rule](./code-style.md).
It sits on the same `pg.Pool`, so it composes with Better Auth and PGlite
unchanged.

```ts
// src/lib/db.ts in a consuming app — the one barrel the rest of the app imports
import { createDb, createPool, createQueries } from "@ingram-tech/nk-db";
import * as schema from "./schema";

export const pool = createPool(); // the ONE pool (TLS-aware; local socket → max:1)
export const db = createDb(pool, schema); // Drizzle, for app queries
export const { query, one, maybeOne, execute, withTx } = createQueries(pool);
```

The raw helpers (`createQueries(pool)`) stay available for the cases Drizzle is
awkward at — `pgmq`-style queue draining, trigger/function calls, `pg_trgm`
search (the SQL some apps keep in frozen `db/migrations/*.sql`). Their
signatures match what apps already hand-rolled, so adoption is a
find-and-replace of the import:

```ts
import { query, maybeOne } from "@/lib/db"; // the app's barrel above

const rows = await query<Row>("select … where … order by … limit $1", [n]);
const row = await maybeOne<Row>("select … where id = $1", [id]);
```

#### Validate the result instead of casting it (the `<T>` is a lie)

`query<Row>(…)` asserts the row shape at compile time and validates **nothing** at
runtime — it is an `as Row` on the wire, and DB rows are external input, which the
[no-`as`-casts rule](./code-style.md) says to validate with Zod. So every raw
helper takes an optional Zod **row schema** as its last argument; pass it and you
get parsed, typed rows instead of a cast:

```ts
import { z } from "zod";

const Balance = z.object({ currency: z.string(), amount: z.coerce.number() });

// validated + coerced; return type is z.infer<typeof Balance>[]
const rows = await query("select currency, amount from report_account_balances($1, $2)", [orgId, acctId], Balance);
const quota = await maybeOne("select consume_unique_user_quota($1, $2, $3) as result", [orgId, uid, cap], QuotaResult);
```

The schema **doubles as the coercion layer**: `z.coerce.number()` for `numeric`
(which `pg` returns as a string) and an ISO transform for timestamps fold into the
same parse, so the `pgNumericToNumber` / `pgTimestampToIso` mapping disappears from
the call site. (The omit-the-schema overload keeps the `<T>` form working
unchanged — this is purely additive.)

On the **Drizzle RLS path** you don't have these helpers — inside
`withRlsTransaction`, `tx.execute()` returns an untyped `{ rows }`. The
result-side `parseRows` / `parseMaybeRow` / `parseOneRow(result, schema)` give it
the same validated/coerced result without wrapping Drizzle's builder:

```ts
import { parseMaybeRow } from "@ingram-tech/nk-db";

const role = parseMaybeRow(
	await withRlsTransaction(db, { sub: userId }, (tx) =>
		tx.execute(sql`select user_organization_role(${orgId}::uuid) as role`),
	),
	z.object({ role: OrganizationRole.nullable() }),
)?.role ?? null;
```

#### Inspecting Postgres errors (`isPgError` / `isUniqueViolation`)

`pg` puts the SQLSTATE on `error.code`, but wrappers re-throw with the original
nested under `.cause`, so a flat `err.code === '23505'` check silently misses it.
`isPgError(err, code)` walks the `.cause` chain; `isUniqueViolation(err)` is the
`23505` shorthand. Reach for `ON CONFLICT` first (see the pooled-connection
footgun under [PGlite gotchas](#pglite-gotchas-these-cost-real-time--encoded-in-the-harness)),
but use these where you genuinely must branch on the failure.

### Row-Level Security on a direct connection (`withRls` / `withRlsTransaction`)

The thing every "keep RLS, drop PostgREST" migration re-derives by hand. On
Supabase, **PostgREST** was what made RLS work: per request it ran `SET ROLE
authenticated` and set `request.jwt.claims` from the user's JWT, so policies
against `auth.uid()` fired. A direct `pg`/Drizzle connection has none of that — it
runs as the connection's role with no claims, so RLS is silently **bypassed**
(privileged role) or **denies everything**. The
[better-auth-migration doc](./better-auth-migration.md) already names the
destination ("tenant isolation is RLS via a dedicated app role") but several apps
each hand-rolled the `SET LOCAL` dance to get there. nk-db now ships it.

`withRlsTransaction(db, claims, fn)` (Drizzle) and `withRls(claims, fn)` (the raw
sibling of `withTx`) open a transaction and, as the first statement, set the
claims GUC + `SET LOCAL ROLE` — reproducing PostgREST exactly, so **existing
`auth.uid()` policies need no changes**:

```ts
// claims come straight from the Better Auth session — no JWT/JWKS bridge
const notes = await withRlsTransaction(db, { sub: session.user.id }, (tx) =>
	tx.select().from(schema.notes),
);
```

Design notes:

- **It's pure Postgres**, so it works the same on Supabase Postgres and on DO —
  the only Supabase-ism is that `auth.uid()`/`auth.role()` live in the `auth`
  schema, which is two trivial functions to recreate on DO (`sub`/`role` out of
  `request.jwt.claims`). This makes "keep RLS" a viable, portable alternative to
  app-layer `where owner_id = …`, reusing policies a site already trusts.
- **It sidesteps the dead JWKS bridge.** Bridge A (Better Auth JWKS as a Supabase
  third-party issuer) only existed so PostgREST could populate the claim; setting
  it ourselves from the session needs no third-party-auth registration — which is
  unavailable on some Supabase plans anyway.
- **GUCs are transaction-local** (`is_local = true`): they reset at
  commit/rollback and never leak across pooled connections. Everything (GUC name,
  claims, role) is **bound, not interpolated** (`rlsPreamble` is the statement;
  exported for middleware that manages its own connection).
- **The caller owns two invariants** the library can't enforce: connect as a role
  that doesn't bypass RLS for user rows (not owner/superuser), and grant that role
  `SET ROLE` to the target. Service-role paths keep using plain `db`/`query`.
- **`role` resolves** as `options.role ?? claims.role ?? "authenticated"`, so a DO
  app role (`app_user`) can differ from the JWT `role` claim.

### Migrations: standardize on `drizzle/`, drop the `supabase/` folder name

The migrated apps still keep migrations in a folder literally named
`supabase/migrations/` — a misleading legacy. New apps use `drizzle/`, generated
by `drizzle-kit generate` and applied in prod by a `scripts/migrate.ts` that runs
them against `DATABASE_URL`. `nk dev` applies them to PGlite (below).

### Code-migration gotchas this package bakes in

Two `pg`-vs-PostgREST quirks bite every app; `types.ts` sets them once so apps
don't each rediscover them:

- **`timestamptz` comes back as a JS `Date`** from `pg`, but supabase-js returned
  ISO **strings** (and generated types say `string`). String ops then break. We
  register a parser to keep them strings where the schema expects strings:
  `pg.types.setTypeParser(1184, (v) => v)` (OID 1184 = timestamptz).
- **`jsonb` params:** `pg` turns a JS array into a Postgres array literal, not
  JSON. Always `JSON.stringify()` jsonb values and cast `$n::jsonb`. The helpers
  document this; Drizzle's `jsonb()` columns handle it for you.

## PGlite dev & test (the `./pglite` subpath)

[PGlite](https://pglite.dev) is Postgres compiled to WASM, in-process — it kills
the "run the whole Supabase Docker stack just to get a dev DB" pain. **PGlite
0.5.x is PostgreSQL 18.3**, so `gen_random_uuid()`, `uuidv7()`, plpgsql, and RLS
all work and dev matches a pg18 prod target. (Probe the version empirically on
upgrade — the docs are vague.)

**Dev (`nk-pglite-dev`, the bin behind `nk dev`):**

- Boot PGlite persisted to `.pglite/` (gitignored), apply the app's `drizzle/`
  migrations, expose it via `PGLiteSocketServer` on `127.0.0.1:5432` so the app's
  normal `pg.Pool` connects through `DATABASE_URL` with **no app code changes**,
  then exec `next dev --turbopack`. A `--fresh` flag wipes `.pglite/` and
  re-migrates.

**Test (`./pglite/test-setup`):**

- In-memory PGlite via Vitest `globalSetup`, `fileParallelism: false`, and a
  `resetDb()` that `TRUNCATE`s in `beforeEach`. Real integration tests against
  real Postgres semantics, instant, no cleanup.

### PGlite gotchas (these cost real time — encoded in the harness)

- **pglite-socket is single-connection** (multiplexed). The local pool **must**
  cap at `max: 1`. `createPool()` detects the local socket and applies this.
- **`pg.Pool` destroys a connection when a query *errors*** (unlike `pg.Client`).
  Over pglite-socket the *next* query then fails with "Connection terminated
  unexpectedly" — **in dev, not just tests.** So any "catch the unique violation,
  then run a follow-up query" pattern is banned: use `INSERT … ON CONFLICT DO
  NOTHING RETURNING …` (partial-index inference works). This also reads cleaner
  and is identical on real Postgres. We add an [oxlint rule](#enforcement)
  flagging `err.code === '23505'` control flow.
- In Vitest, close each file's pool in `afterAll` (modules are isolated per
  file); the test-setup helper does this.

## `nk dev`: golden-path local DB

`nk dev` boots the golden-path database, then `next dev`. It still only
**orchestrates** standard tools resolved from the site's `node_modules` — the
[`nk` carve-out](./philosophy.md#the-nk-carve-out-orchestration-never-interception)
holds (PGlite boot lives in `@ingram-tech/nk-db`'s bin, not in `nk`).

```
nk dev:
  1. If `@ingram-tech/nk-db`'s `nk-pglite-dev` bin resolves → run it
       (boots PGlite, applies migrations, sets DATABASE_URL, exec `next dev`).
  2. Else                                                   → plain `next dev`.
```

`nk dev` no longer boots local Supabase — the fleet has moved off it. The
Supabase-Postgres holdouts run `supabase start` themselves until they migrate.

## Relationship to nk-auth

`createAuthPool` migrates out of `@ingram-tech/nk-auth` and into
`@ingram-tech/nk-db` as `createPool` (the TLS logic is identical). `nk-auth` then
**takes the pool by injection** rather than making its own — realizing the
playbook's "one pool, reused for everything including Better Auth":

```ts
import { createPool } from "@ingram-tech/nk-db";
import { betterAuth } from "better-auth";

export const pool = createPool();
export const auth = betterAuth({ database: pool, /* …nk-auth presets… */ });
```

`nk-auth` keeps a thin re-export of `createPool` for one release with a
deprecation note, then drops it (additive first, per
[releasing](./releasing.md)). Better Auth needs prepared statements, so the pool
must use a **direct connection or session-mode pooling**, never transaction-mode
pgbouncer.

## Enforcement (push it down the ladder)

Per [enforce-what-you-can](./philosophy.md#enforce-what-you-can-document-what-you-cant):

- **oxlint rule:** ban `new Pool(` / `new Client(` outside `src/lib/db.ts` —
  force the shared `createPool()`.
- **oxlint rule:** flag `=== '23505'` (and `.code === ` on caught pg errors) used
  as control flow — steer to `ON CONFLICT`, or to `isPgError` / `isUniqueViolation`
  for the cases that legitimately must branch on the failure (they also walk the
  `.cause` chain a flat check misses).
- **oxlint rule (Tier B):** ban `@supabase/supabase-js` imports for data access
  once a site is on the golden path.

## Decisions (locked)

- **Drizzle is the source of truth; raw SQL is the escape hatch.** Drizzle owns
  the schema, the generated migrations, and the row types for Tier-B apps. The
  `query/one/maybeOne/execute` helpers stay for SQL the ORM is awkward at
  (`select fn($1,…)` calls, `pgmq` draining, `pg_trgm`) — not as a parallel query
  path. They take an optional Zod **row schema** (validate + coerce the result
  instead of casting `<T>`); `parseRows`/`parseMaybeRow`/`parseOneRow` give the
  Drizzle `tx.execute()` path the same on the RLS side.
- **nk-db is mandatory for Tier-B.** Products import `createPool` / `createDb` /
  `createQueries` from here instead of hand-rolling a `src/lib/db/` layer; that is
  the whole point of extracting this slice.
- **Default primary-key id: `uuidv7()`.** Align app tables with nk-auth's ids for
  index/B-tree locality (pg18 / PGlite both provide `uuidv7()`).
- **Prod migrations run via `drizzle-kit migrate`,** invoked from a release/build
  step rather than imported at runtime, so `drizzle-kit` stays a `devDependency`
  and never reaches the serverless bundle.
- **Transaction wrapper:** `createQueries` exposes `withTx` (apps were
  hand-rolling `BEGIN/COMMIT`).
- **RLS on direct connections is first-class, not hand-rolled.** `withRls`
  (raw) and `withRlsTransaction` (Drizzle) own the `SET LOCAL ROLE` +
  `request.jwt.claims` setup. Keeping RLS (claims from the Better Auth session)
  and app-layer `where owner_id = …` are both supported; RLS is the lower-churn
  path when a site already has trusted policies. We do **not** depend on a
  Supabase third-party JWKS issuer for this (see the dead-bridge note above).
