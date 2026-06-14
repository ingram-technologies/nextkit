# @ingram-tech/nk-db

The Ingram **Postgres data layer**: one TLS-aware `pg` pool, raw-SQL helpers,
Drizzle wiring, and a **PGlite** (no-Docker) dev/test harness. It consolidates
the `src/lib/db/` layer that integrain, orbitr.ee, peppost, and thornhill each
hand-rolled when they moved off Supabase. Design + rationale:
[`docs/db-package.md`](https://github.com/ingram-technologies/nextkit/blob/main/docs/db-package.md).

`pg` and `drizzle-orm` are **peer dependencies** (one copy in the app).
`@electric-sql/pglite` + `@electric-sql/pglite-socket` are **optional** peers —
add them as `devDependencies` only if you use `nk dev` / the test harness.

## Install

```bash
bun add @ingram-tech/nk-db pg drizzle-orm
bun add -d @electric-sql/pglite @electric-sql/pglite-socket   # for PGlite dev/test
```

Env contract (validated by `keys.ts`; resolves in precedence order):

```dotenv
DATABASE_URL=…            # direct Postgres (session pooler / :5432), NOT PostgREST
# fallbacks, for running on Supabase Postgres before the data moves:
# POSTGRES_URL_NON_POOLING / POSTGRES_URL
DATABASE_CA_CERT=…        # optional PEM CA → verify-full
DATABASE_SSL=true         # optional
DATABASE_POOL_MAX=5       # optional; keep small on serverless
```

## The one barrel (`src/lib/db.ts`)

Create the pool once and share it across Drizzle, the raw helpers, and Better
Auth — exactly one pool per process.

```ts
import { createDb, createPool, createQueries } from "@ingram-tech/nk-db";
import * as schema from "./schema";

export const pool = createPool(); // TLS-aware; local socket → max:1
export const db = createDb(pool, schema); // Drizzle — the default query path
export const { query, one, maybeOne, execute, withTx } = createQueries(pool);
export { schema };
```

Then `import { db, query } from "@/lib/db"` everywhere. Better Auth reuses the
same pool: `betterAuth({ database: pool, … })`.

- **Drizzle** is the default: schema-first, `drizzle-kit` generates migrations
  into `drizzle/`.
- **Raw helpers** (`createQueries(pool)`) are the escape hatch — Postgres
  functions (`select fn($1,…)`), `pgmq` draining, `pg_trgm`. Signatures match the
  hand-rolled originals, so adopting is a find-and-replace of the import.
- **`configureTimestampsAsStrings()`** — opt-in, for legacy row types that expect
  `timestamptz` as ISO strings (on the golden path, prefer Drizzle's
  `timestamp(..., { mode: "string" })` per column).

## PGlite dev & test (`@ingram-tech/nk-db/pglite`)

`nk dev` runs the `nk-pglite-dev` bin automatically when this package is
installed: it boots Postgres-in-WASM persisted to `.pglite/`, applies the
`drizzle/` migrations, sets `DATABASE_URL`, then runs `next dev`. `--fresh` wipes
and rebuilds. No Docker, no daemon.

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
