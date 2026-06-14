# nextkit docs

Developer-facing documentation, written by and for AI agents (and humans). Start
with the philosophy, then dip into specifics as needed.

- **[philosophy.md](./philosophy.md)** — the "why". Read this first.
- **[architecture.md](./architecture.md)** — repo layout, packages, how
  consumption works.
- **[code-style.md](./code-style.md)** — house code-quality rules.
- **[testing.md](./testing.md)** — testing stack and conventions.
- **[ai-docs-convention.md](./ai-docs-convention.md)** — the `docs/` pattern
  itself, to replicate in every repo.
- **[adopting-nextkit.md](./adopting-nextkit.md)** — migrating a site onto
  nextkit.
- **[oxlint-migration.md](./oxlint-migration.md)** — moving a site from Biome to
  the oxc toolchain (oxlint + oxfmt), with a codemod.
- **[db-package.md](./db-package.md)** — the `@ingram-tech/nk-db` plan: the shared
  Postgres pool, Drizzle, and the PGlite dev/test harness (`nk dev`).
- **[better-auth-migration.md](./better-auth-migration.md)** — moving the fleet
  from Supabase Auth to Better Auth. The RLS-bridge path here now applies to the
  Supabase-Postgres holdouts (fabrile/financica); migrated apps went to DO
  Postgres outright.
- **[creating-a-package.md](./creating-a-package.md)** — checklist for new
  packages.
- **[releasing.md](./releasing.md)** — versioning + npm Trusted Publishing flow.
- **[ingram-cloud.md](./ingram-cloud.md)** — planned backend (placeholder).
