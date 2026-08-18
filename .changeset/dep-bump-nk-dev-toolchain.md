---
"@ingram-tech/nk-dev": patch
---

Toolchain bumps, which nk-dev ships as real dependencies and therefore pins for
the whole fleet: oxlint 1.78.0, oxfmt 0.63.0, knip 6.32.2, `@ast-grep/cli`
0.45.1, `@testing-library/jest-dom` 7.0.1. No new oxlint rule fires on this
repo and no formatting changed, so consuming sites should see a silent upgrade.
