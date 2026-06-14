# @ingram-tech/oxlint-config

Shared [oxlint](https://oxc.rs) (lint) + [oxfmt](https://oxc.rs/docs/guide/usage/formatter.html)
(format) configuration for Ingram Technologies Next.js projects. This is the
single source of truth for code style and lint rules across the fleet.

> Replaces `@ingram-tech/biome-config`. See
> [`docs/oxlint-migration.md`](https://github.com/ingram-technologies/nextkit/blob/main/docs/oxlint-migration.md)
> for the one-step codemod.

## Install

```bash
bun add -d @ingram-tech/oxlint-config oxlint oxfmt
```

## Lint — `.oxlintrc.json`

oxlint's `extends` resolves **file paths relative to your config**, not package
specifiers. Point it at the installed file:

```json
{
	"$schema": "./node_modules/oxlint/configuration_schema.json",
	"extends": ["./node_modules/@ingram-tech/oxlint-config/oxlintrc.json"],
	"ignorePatterns": ["dist", ".next"]
}
```

`extends` merges left-to-right; add project rules in `rules`/`overrides` below
it and they win.

## Format — `.oxfmtrc.json`

oxfmt has **no `extends`**. Either point `oxfmt -c` at the shared file:

```bash
oxfmt -c ./node_modules/@ingram-tech/oxlint-config/oxfmtrc.json --write .
```

…or (simpler, what the codemod does) copy it to a local `.oxfmtrc.json` so
oxfmt auto-discovers it. The format config is tiny and stable (tabs / width 4 /
line 88); a copy rarely drifts.

> If you use [`@ingram-tech/nk-cli`](../nk-cli), `nk format` / `nk check` invoke
> oxfmt for you against this config — no `-c` needed.

## What it enforces

- **Tabs, width 4, line length 88** — the house format (oxfmt).
- **oxlint `correctness` as errors**, plus the typescript / unicorn / oxc /
  react / jsx-a11y / import plugins. Notably `typescript/no-explicit-any` and
  `typescript/no-non-null-assertion` are **errors**; unused vars/imports and
  `react/exhaustive-deps` are `warn`; the a11y rules that fight server
  components are relaxed.
- Import sorting, Tailwind class sorting, and `package.json` key sorting are
  available in oxfmt but left **off** here for now (parity with the prior Biome
  setup); they're candidates for a future opt-in bump.

## Project-specific rules

Need a rule unique to your codebase? Don't add it here — use a local oxlint
[JS plugin](https://oxc.rs/docs/guide/usage/linter/plugins) (`jsPlugins`) in
your repo and reference it from your own `.oxlintrc.json`. This package stays
general; repo-specific enforcement stays local.
