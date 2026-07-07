# nextkit docs

Developer-facing documentation, written by and for AI agents (and humans). Start
with the philosophy, then dip into specifics as needed. Per-package **usage**
docs live in each package's own `packages/*/README.md` (linked from the
[root README](../README.md) table); the docs here carry the cross-cutting
conventions and the design/decision records.

**Foundations**

- **[philosophy.md](./philosophy.md)** — the "why". Read this first.
- **[architecture.md](./architecture.md)** — repo layout, packages, how
  consumption works.
- **[ai-docs-convention.md](./ai-docs-convention.md)** — the `docs/` pattern
  itself, to replicate in every repo.

**Working here**

- **[code-style.md](./code-style.md)** — house code-quality rules.
- **[testing.md](./testing.md)** — testing stack and conventions.
- **[transactional-email.md](./transactional-email.md)** — fleet conventions for
  transactional email: registry templates, from-address local parts, the
  dev/unconfigured fallback, and imports.
- **[creating-a-package.md](./creating-a-package.md)** — checklist for new
  packages.
- **[releasing.md](./releasing.md)** — versioning + npm Trusted Publishing flow.

**Adopting & packages**

- **[adopting-nextkit.md](./adopting-nextkit.md)** — migrating a site onto
  nextkit.
- **[db-package.md](./db-package.md)** — `@ingram-tech/nk-db` design & decision
  record: the shared Postgres pool, RLS, migrations, and the PGlite dev/test
  harness.
- **[marketing.md](./marketing.md)** — `@ingram-tech/nk-marketing`: contacts +
  consent, newsletter broadcasts, and idempotent lifecycle/triggered email.
- **[blog.md](./blog.md)** — `@ingram-tech/nk-blog`: frontmatter-indexed posts,
  limited-MDX rendering, the component vocabulary, GitHub publish, migration
  recipe.
