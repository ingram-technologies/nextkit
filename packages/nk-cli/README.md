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

`nk` shells out to the site's own `bunx`-resolved tools (oxlint, oxfmt, Next,
tsc, Supabase), so versions stay under each site's control — nk just orchestrates.

> **`nk` is optional.** It only orchestrates the standard commands; it never
> wraps or intercepts the Next.js build. Every site must stay fully buildable
> and runnable with plain `next build` / `next dev` if `nk` is removed — see the
> [`nk` carve-out](https://github.com/ingram-technologies/nextkit/blob/main/docs/philosophy.md)
> in the philosophy doc. The orchestration tests in this package check that the
> formatter resolves to standard oxlint/oxfmt invocations and nothing more.

## Commands

- **`nk dev`** — start the Next dev server on the golden-path local database
  (see [`db-package.md`](https://github.com/ingram-technologies/nextkit/blob/main/docs/db-package.md)):
  - **PGlite** — if `@ingram-tech/nk-db`'s `nk-pglite-dev` bin resolves, hand off
    to it: boot Postgres-in-WASM, apply the `drizzle/` migrations, set
    `DATABASE_URL`, then `next dev --turbopack`. No Docker, no daemon. Replaces
    hand-written `scripts/pglite-dev.ts`.
  - **Plain** — otherwise just `next dev` (static/marketing sites with no DB).

  `nk dev` no longer boots local Supabase — the fleet has moved off it; any
  Supabase-Postgres holdouts start Supabase themselves until they migrate.
- **`nk format` / `nk format --check`** — formats code (JS/TS/JSON/CSS) with
  oxfmt and SQL with Prettier. `--check` verifies without writing (CI).
- **`nk lint`** — `oxlint`
- **`nk check`** — `oxlint` + `oxfmt --check` plus SQL format verification.
  The CI gate.
- **`nk type-check`** — `next typegen && tsc --noEmit`.
- **`nk build [...]`** — `next build`, extra args passed through.

## Why Prettier for SQL?

oxfmt is the formatter for code and stays that way — Prettier is never used for
JS/TS. But oxfmt can't format SQL, so `nk` bundles `prettier` +
`prettier-plugin-sql` **as its own dependencies** and uses them only for `.sql`
files. Prettier therefore never lands in any app's `package.json`. A site's own
`.prettierrc` / package.json `"prettier"` settings are honored if present;
otherwise nk defaults to tabs + the Postgres dialect.
