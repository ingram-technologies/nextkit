# @ingram-tech/git-hooks

## 0.2.0

### Minor Changes

- Switch the format-on-commit hook from Biome to **oxfmt**. `nextkit-format-staged` now runs `oxfmt --write` on staged files (auto-discovering the repo's `.oxfmtrc.json`) instead of `biome format`. Same behavior — format staged files, re-stage, no lint gate — on the oxc toolchain. Sites need `oxfmt` resolvable via `bunx` (it is, on demand).

## 0.1.0

### Minor Changes

- New package: shared git hooks. A format-only pre-commit (`nextkit-format-staged`) that formats staged files and re-stages them. Sites point their committed `.githooks/pre-commit` at this bin so the behavior updates in one place.
