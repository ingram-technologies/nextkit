---
"@ingram-tech/nk-db": minor
---

Add a drift-aware migration runner and stop the PGlite test harness colliding with a dev Postgres.

**`@ingram-tech/nk-db/migrate` (+ `nk-pg-migrate` bin)** — a drop-in replacement for `drizzle-kit migrate` that fixes two recurring pains:

- It uses drizzle-orm's own migrator, so a failing statement throws the **real Postgres error** instead of drizzle-kit's opaque exit 1.
- It runs a pre-flight check and throws a clear `MigrationDriftError` (with remediation) when the DB's `__drizzle_migrations` journal is out of sync with the `drizzle/` files — the "schema built via db:push" / "0000 baseline regenerated" case that otherwise dies with a confusing `relation "..." already exists`.

Exports `runMigrations`, `inspectMigrations`, `baselineMigrations` (reconcile a journal whose schema is already correct, no DDL re-run), `readJournal`, and `MigrationDriftError`. All accept a connection string (via the env contract / `createPool`) or an existing `pool`. The `nk-pg-migrate` bin supports `--status`, `--baseline`, and `--migrations <folder>`; set a site's `db:migrate` script to it.

**PGlite test harness** — `createTestDb` now defaults to an **ephemeral free port** instead of `5432`, so the integration suite no longer dies with `EADDRINUSE` when a developer has a real Postgres running on 5432. Tests reach the db through the returned `pool`/`databaseUrl`, so the port is irrelevant; an explicit `port` or `PGLITE_PORT` still wins. `startPgliteDev` keeps the stable 5432 it needs.
