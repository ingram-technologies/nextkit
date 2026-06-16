# @ingram-tech/nk-cli

## 0.3.0

### Minor Changes

- c474d3d: Drop the swappable formatter backend — `nk` is now hard-wired to oxc (oxlint +
  oxfmt). The `{ "nk": { "formatter": "biome" } }` escape hatch is gone, along with
  the `nk` package.json config block it was the only consumer of. Sites still on
  Biome must drive `biome` through their own package.json scripts rather than via
  `nk`. SQL still formats through bundled Prettier, unchanged.

## 0.2.0

### Minor Changes

- Default the formatter to **oxc** (oxlint + oxfmt). `nk format` / `nk lint` / `nk check` now invoke oxfmt and oxlint; SQL still formats through the bundled Prettier. Biome stays fully wired as a fallback — opt in with `{ "nk": { "formatter": "biome" } }`. `nk check` runs lint and format-check as separate passes (oxc splits them across two tools) and reports both before failing.
- `nk check` now gates the agent-guide import: if a site depends on `@ingram-tech/agent-guide` but its CLAUDE.md doesn't `@import` the guide, the check fails with a fix-it message.
- `nk dev` now boots the golden-path local database via `@ingram-tech/nk-db` (PGlite — Postgres in WASM, no Docker) when installed, else plain `next dev`. **`nk dev` no longer boots local Supabase** — sites still on Supabase must start it themselves.

## 0.1.0

### Minor Changes

- 26e6d73: New package: `nk`, the nextkit CLI. `nk dev` starts Next and boots local Supabase first (wiring its env in) when `supabase/config.toml` is present — replacing per-site `dev.sh`. Adds `nk format` (Biome for code, Prettier for SQL — bundled, so Prettier never lands in app deps), plus `lint` / `check` / `type-check` / `build`. The code formatter sits behind a small indirection so it can move to oxc later via `{ "nk": { "formatter": "oxc" } }`.
