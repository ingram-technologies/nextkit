---
"@ingram-tech/nk-db": patch
---

id/sql: `id758_decode(id, prefix)` pins its `search_path` to the one it was created under, so it works when called from a function with `set search_path = ''` (SECURITY DEFINER RLS helpers). `ID758_SQL` / `ID758_SQL_STATEMENTS` / `id758Migration` now carry the pin, and the PGlite harness and `fingerprintChain` install it. Sites that already applied the functions need a new custom migration: `bunx drizzle-kit generate --custom --name id758_search_path`, paste `id758Migration` into it again (idempotent), `nk migrations`, then apply it.
