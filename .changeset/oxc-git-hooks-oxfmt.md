---
"@ingram-tech/git-hooks": minor
---

Switch the format-on-commit hook from Biome to **oxfmt**. `nextkit-format-staged`
now runs `oxfmt --write` on staged files (auto-discovering the repo's
`.oxfmtrc.json`) instead of `biome format`. Same behavior — format staged files,
re-stage, no lint gate — on the oxc toolchain. Sites need `oxfmt` resolvable via
`bunx` (it is, on demand); see [`docs/oxlint-migration.md`](https://github.com/ingram-technologies/nextkit/blob/main/docs/oxlint-migration.md).
