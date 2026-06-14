---
"@ingram-tech/agent-guide": patch
---

Add `@ingram-tech/nk-db` to the package list (the Postgres data layer: pool +
raw-SQL helpers + Drizzle + PGlite harness), and update the `nk dev` line — it
now boots local PGlite via `@ingram-tech/nk-db` (then Next), not local Supabase.
