---
"@ingram-tech/nk-db": minor
---

Migration, pool, and coercion safety fixes:

- **`runMigrations` is now concurrency-safe.** The whole run (drift pre-flight + migrate) executes on one client holding `pg_advisory_lock` — drizzle's migrator takes no lock of its own, so two concurrent deploys could both apply the same pending set and leave duplicate journal rows (permanent `MigrationDriftError`). The second runner now blocks, then no-ops. `applied` is computed inside the lock, so it reports what the run actually did.
- **PGlite dev applies new migrations on every boot.** Previously migrations ran only when the `.pglite/` data dir didn't exist, so any migration added after the first boot was silently skipped until a data-wiping `--fresh`. The drizzle migrator is journal-tracked, so re-running is incremental and cheap; a custom `migrate` override must be idempotent the same way.
- **Local detection wins over pulled env.** A `vercel env pull`'d `DATABASE_POOL_MAX`/`DATABASE_CA_CERT` no longer overrides the mandatory `max: 1` / no-TLS for a local (PGlite) connection — the exact dev breakage the local branch exists to prevent. `isLocal` also parses the URL hostname instead of substring-matching the whole connection string.
- **`withTx`/`withRls` no longer mask the real error** when the failing query destroyed the connection and the rollback itself rejects.
- **`pgTimestampToIso` treats offset-less timestamps as UTC.** `timestamp without time zone` text (the very columns the helper exists for) was parsed in the host's local zone, shifting the instant on any non-UTC machine.
- Hardening: `decode58` rejects 22-char bodies that overflow 128 bits instead of silently aliasing two wire ids to one UUID; `isPgError` caps `.cause`-chain depth so a cyclic chain can't hang; the journal file is Zod-validated; `resetPublicTables` escapes quotes in table names; `nk-pg-migrate --migrations` without a value errors instead of eating the next flag; `startPgliteDev` handles a failed `next dev` spawn and validates `PGLITE_PORT`.
