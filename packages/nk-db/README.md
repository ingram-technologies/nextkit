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
with `pg_advisory_lock`.

It also refuses to under-apply. drizzle's migrator picks what to run by
`when > max(created_at)`, so a migration whose journal timestamp lands below an
already-applied one is skipped **silently and permanently, reported as
success** — the shape two branches produce when they generate migrations and
merge in the other order. This runner computes pending as a set difference on
hash and throws `MigrationOrderError` naming the stranded migration and the
timestamp to clear; raising that entry's `when` in `meta/_journal.json` fixes it
without touching the `.sql`, so the hash every database recorded stays valid.
`--status` reports the same thing before you deploy.

The same surface is available programmatically:
`runMigrations` / `inspectMigrations` / `baselineMigrations` from
`@ingram-tech/nk-db/migrate`.

## Prefixed ids (`@ingram-tech/nk-db/id`)

The codec is the standalone [`id758`](https://github.com/ingram-technologies/id758)
package: `uuidv7()`, `encodeId` / `decodeId` / `mintId`, and `createIdRegistry`
for typed per-entity helpers. This subpath re-exports all of it, plus the
pre-extraction names (`uuidGenerateId`, `toPrefixedId`, `fromPrefixedId`,
`base58Id`) as deprecated aliases, so either import path works.

**The module is isomorphic** (no imports, randomness from Web Crypto), so a
Drizzle `schema.ts`, a client component or an edge runtime can all use it. Keep
it that way: a single `node:crypto` import makes every module that touches an id
node-only (a test enforces this).

Store the raw `uuid` and encode at the edge. The prefixed id is presentation, not
identity: inside the DB, "which entity is this?" is already carried by the
column, so storing the prefix duplicates schema metadata into every row.

**Ids are self-describing, uuids are not.** A prefix names its entity, so
decoding needs no context — `entityOf(registry, id)` and `decodeAnyId(registry,
id)` resolve one from the value alone, which is what makes polymorphic FKs and
raw-SQL bindings work. The inverse does not hold: encoding always needs to know
which entity you meant. Automate decode; enforce encode with the `Id<E>` brand.

### Drizzle bindings (`@ingram-tech/nk-db/id/drizzle`)

Decode public ids at the **column**, so a skinned id reaching a query stops being
a failure mode:

```ts
export const ids = createIdRegistry({ invoice: "inv", account: "acct" });
export const { idColumn, polymorphicIdColumn, sqlUuid, sqlUuidArray } =
    createIdColumns(ids);

export const invoices = pgTable("invoices", {
    id: idColumn("invoice")().primaryKey(),      // eq(invoices.id, "inv_…") just works
    account_id: idColumn("account")().notNull(),
    entity_id: polymorphicIdColumn(),            // decodes any entity's id
});
```

Drizzle runs `toDriver` on WHERE values (`eq`, `inArray`) as well as insert/update
`SET`, and `dataType` stays `uuid` — so there is **no DDL and no migration**, and
`drizzle-kit generate` reports no diff. There is deliberately no `fromDriver`
(see the encode asymmetry above).

Raw SQL and RPC args bypass the column layer, so bind those with `sqlUuid(id)` /
`sqlUuidArray(ids)` rather than a bare `${id}::uuid`.

This subpath pulls only `drizzle-orm` and the codec — never `pg` — because it is
imported by `schema.ts`.

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
