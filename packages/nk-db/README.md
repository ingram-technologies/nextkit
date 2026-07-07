# @ingram-tech/nk-db

The Ingram **Postgres data layer**: one TLS-aware `pg` pool, raw-SQL helpers,
Drizzle wiring, a drift-aware migration runner, and a **PGlite** (no-Docker)
dev/test harness. Design + rationale:
[`docs/db-package.md`](https://github.com/ingram-technologies/nextkit/blob/main/docs/db-package.md).

`pg` and `drizzle-orm` are **peer dependencies** (one copy in the app).
`@electric-sql/pglite` + `@electric-sql/pglite-socket` are **optional** peers —
add them as `devDependencies` only if you use `nk dev` / the test harness.

## Install

```bash
bun add @ingram-tech/nk-db pg drizzle-orm
bun add -d @electric-sql/pglite @electric-sql/pglite-socket   # for PGlite dev/test
```

Env contract (validated by `keys.ts`):

```dotenv
DATABASE_URL=…            # direct Postgres (session pooler / :5432), not a REST proxy
DATABASE_CA_CERT=…        # optional PEM CA → verify-full
DATABASE_SSL=true         # accepted for compatibility but inert — TLS is decided
                          # by the URL host and DATABASE_CA_CERT (see below)
DATABASE_POOL_MAX=5       # optional; keep small on serverless
```

TLS is determined by the connection string and the CA cert, never by a flag: a
local host (`127.0.0.1`/`localhost`) gets no TLS and a `max: 1` pool (the
PGlite socket is single-connection — local detection also wins over a pulled
`DATABASE_POOL_MAX`/`DATABASE_CA_CERT`); with `DATABASE_CA_CERT` set the server
cert + hostname are verified; otherwise TLS runs without chain verification
(managed-provider certs aren't in Node's trust store).

## The one barrel (`src/lib/db.ts`)

Create the pool once and share it across Drizzle, the raw helpers, and Better
Auth — exactly one pool per process.

```ts
import { createDb, createPool, createQueries } from "@ingram-tech/nk-db";
import * as schema from "./schema";

export const pool = createPool(); // TLS-aware; local socket → max:1
export const db = createDb(pool, schema); // Drizzle — the default query path
export const { query, one, maybeOne, execute, withTx, withRls } = createQueries(pool);
export { schema };
```

Then `import { db, query } from "@/lib/db"` everywhere. Better Auth reuses the
same pool: `betterAuth({ database: pool, … })`.

- **Drizzle** is the default: schema-first, `drizzle-kit` generates migrations
  into `drizzle/`.
- **Raw helpers** (`createQueries(pool)`) are the escape hatch — Postgres
  functions (`select fn($1,…)`), `pgmq` draining, `pg_trgm`. Signatures match the
  hand-rolled originals, so adopting is a find-and-replace of the import.
- **`pgTimestampToIso(value)` / `pgNumericToNumber(value)`** — response-boundary
  coercions for strict schemas. `pg`/Drizzle return `numeric` as a string and
  `timestamp(..., { mode: "string" })` as Postgres' text form; these convert to
  the `z.number()` / strict `z.iso.datetime()` shapes such schemas expect.
  Offset-less timestamps (a `timestamp` *without* time zone column) are treated
  as UTC. Presentation only — keep money math on the decimal value. For string
  timestamps prefer Drizzle's `timestamp(..., { mode: "string" })` per column.

## Keeping RLS on a direct connection (`withRls` / `withRlsTransaction`)

A plain `pg`/Drizzle connection runs as the connection's role with **no request
claims**, so `auth.uid()` policies can't fire — nothing populates the
`request.jwt.claims` they read. These helpers set the claims GUC + `SET LOCAL
ROLE` **per transaction**, so your **existing RLS policies keep working
unchanged**, wherever the cluster lives. It's pure Postgres and behaves
identically everywhere.

```ts
import { withRlsTransaction } from "@ingram-tech/nk-db";
import { auth } from "@/lib/auth"; // your Better Auth instance
import { db } from "@/lib/db";

const session = await auth.api.getSession({ headers });
// scoped: sets request.jwt.claims + SET LOCAL ROLE authenticated, then runs fn
const notes = await withRlsTransaction(db, { sub: session.user.id }, (tx) =>
	tx.select().from(schema.notes), // returns only this user's rows
);
```

The claims come **straight from the Better Auth session** (`sub` = `user.id`) — no
JWT minting, no JWKS issuer, no third-party auth bridge. The raw helpers expose the same
thing as `withRls` (sibling of `withTx`):

```ts
const { withRls } = createQueries(pool);
const rows = await withRls({ sub: userId }, (tx) =>
	tx.query<Note>("select * from notes"),
);
```

Two requirements **you** own (they can't be enforced from the library):

- **Connect as a role that doesn't bypass RLS** for user-facing rows — not the
  table owner, not a `BYPASSRLS` superuser. After `SET ROLE authenticated`, RLS
  applies even when the underlying connection is a superuser. Service-role/admin
  paths keep using plain `db` / `query` and bypass RLS as before.
- **The connecting role must be allowed to `SET ROLE`** to the target
  (on DO, `GRANT app_user TO the_connecting_role`).

Override the role / claims GUC when your DB role name differs from the JWT claim:
`withRlsTransaction(db, { sub }, fn, { role: "app_user" })`. Both helpers set the
GUCs **transaction-locally** (`is_local = true`), so they reset at
commit/rollback and never leak across pooled connections. See
[`docs/db-package.md` §RLS](https://github.com/ingram-technologies/nextkit/blob/main/docs/db-package.md)
and the [`@ingram-tech/nk-auth`](https://github.com/ingram-technologies/nextkit/blob/main/packages/nk-auth) README.

## Migrations (`@ingram-tech/nk-db/migrate`, `nk-pg-migrate`)

A drop-in replacement for `drizzle-kit migrate` in the site's `db:migrate`
script (you still *generate* migrations with `drizzle-kit generate`):

```bash
nk-pg-migrate              # apply pending migrations
nk-pg-migrate --status     # journal status, apply nothing
nk-pg-migrate --baseline   # record the current file chain as applied, no DDL
```

Unlike `drizzle-kit migrate` it surfaces the real Postgres error on failure,
pre-flights journal drift (`MigrationDriftError` with a fix-it message instead
of a confusing `relation already exists`), and serializes concurrent deploys
with `pg_advisory_lock`. The same surface is available programmatically:
`runMigrations` / `inspectMigrations` / `baselineMigrations` from
`@ingram-tech/nk-db/migrate`.

## Prefixed ids (`@ingram-tech/nk-db/id`)

UUIDv7 minting (`uuidGenerateId`) plus a base58 "skin" for wire ids
(`team_3nX…` ↔ stored UUID): `toPrefixedId` / `fromPrefixedId` / `base58Id`,
and `createIdRegistry` for typed per-entity helpers.

## PGlite dev & test (`@ingram-tech/nk-db/pglite`)

`nk dev` runs the `nk-pglite-dev` bin automatically when this package is
installed: it boots Postgres-in-WASM persisted to `.pglite/`, applies the
`drizzle/` migrations (journal-tracked, so every boot picks up new ones), sets
`DATABASE_URL`, then runs `next dev`. `--fresh` wipes and rebuilds. No Docker,
no daemon.

Tests use an in-memory instance:

```ts
import { createTestDb } from "@ingram-tech/nk-db/pglite";

// Vitest: fileParallelism:false (the socket is single-connection).
const { pool, db, reset, close } = await createTestDb({ migrationsFolder: "drizzle" });
// beforeEach(reset); afterAll(close);
```

## Gotchas it bakes in

- **Local pool is capped at `max:1`** — the PGlite socket is single-connection;
  a larger pool breaks dev with "Connection terminated unexpectedly".
- **`pg.Pool` destroys a connection on a query *error*.** Don't catch unique
  violations as control flow — use `INSERT … ON CONFLICT DO NOTHING RETURNING …`.
- **`jsonb` params:** `JSON.stringify()` the value and cast `$n::jsonb` (Drizzle's
  `jsonb()` columns handle this).
