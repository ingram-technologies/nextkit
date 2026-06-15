# @ingram-tech/agent-guide

## 0.2.0

### Minor Changes

- 9aba41f: Add login-auth URL conventions and list `@ingram-tech/nk-auth` under "What nextkit
  provides". Better Auth (via nk-auth) mounts at `/auth` through `basePath:
authBasePath` — **not** the framework default `/api/auth` — so login / social OAuth
  callbacks are `<site>/auth/callback/<provider>`, distinct from connector /
  app-install callbacks at `/internal/connect/<provider>/callback`. Stops agents
  defaulting to the `/api/auth` callback path and registering the wrong redirect URI.
- d6bd292: Add a "Route & URL conventions" section: `/api/…` is the public API only, and all
  plumbing lives under `/internal/…` — the OAuth/app-install handshake at
  `/internal/connect/<provider>/{start,callback}`, inbound provider webhooks at
  `/internal/webhooks/<provider>`, and workers/crons at `/internal/{worker,cron}/<name>`.
  Keeps connector wiring consistent across nextkit apps.

### Patch Changes

- 258cd15: Add `@ingram-tech/nk-db` to the package list (the Postgres data layer: pool +
  raw-SQL helpers + Drizzle + PGlite harness), and update the `nk dev` line — it
  now boots local PGlite via `@ingram-tech/nk-db` (then Next), not local Supabase.
- 56b48c3: Note that `nk` is optional convenience that only orchestrates the standard tools
  — a nextkit site must stay buildable with plain `next build` / `next dev`. Keeps
  the agent guide consistent with the prime directive.

## 0.1.1

### Patch Changes

- 26e6d73: Mention `@ingram-tech/nk-cli` (the `nk` command) and refine the formatting rule: Biome formats code, Prettier is used only for SQL (via `nk`), which Biome can't format.
