---
"@ingram-tech/nk-cli": minor
---

`nk dev` now boots the golden-path local database: if `@ingram-tech/nk-db` is
installed it hands off to that package's `nk-pglite-dev` bin (PGlite — Postgres
in WASM, no Docker — which applies the `drizzle/` migrations, sets
`DATABASE_URL`, then runs `next dev`); otherwise it just runs `next dev` for
static/marketing sites. **`nk dev` no longer boots local Supabase** — the fleet
has moved off it. Any site still running local Supabase must start it itself
(`supabase start`) before `nk dev`.
