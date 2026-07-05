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
- **[marketing.md](./marketing.md)** — `@ingram-tech/nk-marketing`: contacts +
  consent, newsletter broadcasts, and idempotent lifecycle/triggered email.
- **[blog.md](./blog.md)** — `@ingram-tech/nk-blog`: frontmatter-indexed posts,
  limited-MDX rendering, the component vocabulary, GitHub publish, migration
  recipe.
- **[creating-a-package.md](./creating-a-package.md)** — checklist for new
  packages.
- **[releasing.md](./releasing.md)** — versioning + npm Trusted Publishing flow.
- **[ingram-cloud.md](./ingram-cloud.md)** — planned backend (placeholder).
