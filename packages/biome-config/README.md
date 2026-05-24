# @ingram-tech/biome-config

Shared [Biome](https://biomejs.dev) configuration for Ingram Technologies
Next.js projects. This is the single source of truth for code style and lint
rules across the fleet.

## Install

```bash
bun add -d @ingram-tech/biome-config @biomejs/biome
```

## Use

Create a `biome.json` in your project root that extends this config:

```json
{
	"$schema": "https://biomejs.dev/schemas/2.4.15/schema.json",
	"extends": ["@ingram-tech/biome-config/biome.json"],
	"files": {
		"includes": ["src/**", "*.{ts,js,json}"],
		"ignoreUnknown": true
	}
}
```

You set your own `files.includes` (every project's layout differs); everything
else — formatter settings and lint rules — comes from here and updates when you
bump this package.

## What it enforces

- **Tabs, width 4, line length 88** — the house format.
- **Biome recommended rules**, with a few deliberate adjustments (see
  `biome.json`). Notably `noNonNullAssertion`, `noExplicitAny`, and the
  unused-variable/import rules are `warn` (visible, non-blocking); React a11y
  rules that fight server components are relaxed.

## Project-specific rules

Need a rule unique to your codebase (e.g. "this helper must be imported, never
redefined")? Don't add it here — add a local [GritQL plugin](https://biomejs.dev/linter/plugins/)
in your repo's `biome-plugins/` and reference it from your own `biome.json`'s
`plugins` array. This package stays general; repo-specific enforcement stays
local.
