---
"@ingram-tech/nk-db": minor
---

`nk-pg-migrate` refuses to under-apply, and reports what the migrator can't reach.

drizzle's migrator picks what to run with `when > max(created_at)` — a
high-water mark. A migration whose journal timestamp lands below an
already-applied one is skipped, never recorded, and reported as **success**,
and the gap is permanent. It doesn't register as drift either: the recorded
rows still match the files positionally. Two branches generating migrations and
merging in the other order produce exactly this, as does a hand-edited `when`.

`inspectMigrations` now computes `pending` as a set difference on hash rather
than by timestamp, and adds `unreachable` (pending files the migrator will
never reach) and `journalIssues` (non-increasing `when`, gaps or repeats in
`idx`). `runMigrations` throws the new `MigrationOrderError` instead of running
a partial chain, naming the stranded migrations and the timestamp to clear;
`nk-pg-migrate --status` reports both before a deploy.

The fix it points at is raising the stranded entry's `when` in
`meta/_journal.json`, which leaves the `.sql` — and so the hash every database
recorded — untouched.

`MigrationFileMeta` gains `idx`.
