# @ingram-tech/nk-cli

`nk` — the nextkit CLI. One command for the things every Ingram Next.js site
does the same way, so they aren't reimplemented as per-site shell scripts.

## Install

```sh
bun add -D @ingram-tech/nk-cli
```

Then point your package.json scripts at it:

```jsonc
{
	"scripts": {
		"dev": "nk dev",
		"format": "nk format",
		"lint": "nk lint",
		"check": "nk check",
		"type-check": "nk type-check",
		"build": "nk build"
	}
}
```

`nk` shells out to the site's own `bunx`-resolved tools (Biome, Next, tsc,
Supabase), so versions stay under each site's control — nk just orchestrates.

## Commands

- **`nk dev`** — start the Next dev server. If `supabase/config.toml` is present,
  it runs `supabase start`, reads `supabase status` into the env var names our
  apps expect (`SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SECRET_KEY`), then launches `next dev --turbopack`. No Supabase dir →
  it just starts Next. Replaces hand-written `scripts/dev.sh`.
- **`nk format` / `nk format --check`** — formats code (JS/TS/JSON/CSS) with
  Biome and SQL with Prettier. `--check` verifies without writing (CI).
- **`nk lint`** — `biome lint .`
- **`nk check`** — `biome check .` (lint + format) plus SQL format verification.
  The CI gate.
- **`nk type-check`** — `next typegen && tsc --noEmit`.
- **`nk build [...]`** — `next build`, extra args passed through.

## Why Prettier for SQL?

Biome is the formatter for code and stays that way — Prettier is never used for
JS/TS. But Biome can't format SQL, so `nk` bundles `prettier` +
`prettier-plugin-sql` **as its own dependencies** and uses them only for `.sql`
files. Prettier therefore never lands in any app's `package.json`. A site's own
`.prettierrc` / package.json `"prettier"` settings are honored if present;
otherwise nk defaults to tabs + the Postgres dialect.

## Swapping the formatter

Biome is the default. The code formatter is behind a small indirection, so when
oxc's formatter is GA you can switch a single site with:

```jsonc
{ "nk": { "formatter": "oxc" } }
```
