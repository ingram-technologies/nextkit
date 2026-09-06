---
"@ingram-tech/nk-dev": minor
---

`nk check` resolves the tailwind `@source` paths in the site's stylesheets and
fails on one that matches nothing. Tailwind v4 resolves `@source` against the
CSS file that carries it and treats a path matching no files as an empty scan,
so a path one directory short silently drops every utility class only those
files use: in a monorepo that means the shared component package's buttons,
badges, tabs and sheets render unstyled in production. Nothing else catches it,
because nothing else in the toolchain reads CSS: oxlint and tsc do not parse
it, knip walks the import graph, and `next build` exits 0 with a smaller
stylesheet. Globbed sources are checked at their literal prefix
(`../packages/*/src` is checked as `../packages`), `@source inline(...)` is
ignored, and a site with no `@source` is a no-op.
