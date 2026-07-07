---
"@ingram-tech/nk-dev": minor
---

Toolchain consolidation:

- **`nk` no longer formats SQL.** `nk format`/`nk check` run oxfmt only; the `prettier` + `prettier-plugin-sql` dependencies are dropped. SQL in these repos is ~all generated (drizzle migrations, `pg_dump` baselines, pglite fixtures), so formatting it only churned generated files and crashed on psql directives (`\restrict`) for no gain.
- **`nk test`** — new passthrough for `vitest run` (extra args forwarded), completing the set alongside `lint`/`format`/`check`/`type-check`/`build`.
- **`nk doctor [--fix]`** — reports a site's drift from the canonical nk-dev toolchain (scripts not pointing at `nk`, superseded deps, `.oxlintrc.json`/`tsconfig.json` extends not pointing at nk-dev, a missing CLAUDE.md guide import, stale `knip.json` ignores, a dead `.prettierignore`) and, with `--fix`, applies the mechanical corrections. Exits non-zero on model-breaking findings so it can gate CI.
- **`nk check` warns on tooling drift** — a non-fatal notice when a site re-declares a package nk-dev supersedes (`oxfmt`, `oxlint`, `prettier*`, `@ingram-tech/{oxlint,typescript}-config`, `@ingram-tech/nk-cli`, `@ingram-tech/git-hooks`), pointing at `nk doctor --fix`.
