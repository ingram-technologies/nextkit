# @ingram-tech/nk-dev

The nextkit **dev toolchain in one package**. Everything a site needs at
development time — and nothing that ships to production — lives here:

- the **`nk` CLI** (`nk dev` / `format` / `lint` / `knip` / `ast-grep` / `migrations` / `check` / `type-check` / `test` / `build`, plus
  `nk doctor`);
- the shared **oxlint + oxfmt**, **TypeScript**, and **Vitest** config;
- **knip** (unused dependency / export / file detection), bundled and run by `nk check`;
- the **oxfmt format-on-commit** git hook (`nextkit-format-staged`);
- the **AI agent guide** (`guide.md`) imported into a site's `CLAUDE.md`;
- **`nk init`**, which scaffolds a site to use all of the above.

It's a single `devDependency` and pulls the toolchain (oxlint, oxfmt, tsc,
vitest, jsdom, jest-dom, knip) as hard dependencies — so one install gives you
the whole stack instead of re-listing each tool per site.

> **Runtime vs dev-time.** nk-dev is the *dev-time* bundle. Runtime features
> (`@ingram-tech/nk-email`, `nk-db`, `nk-auth`, …) stay separate packages that
> peer-depend on `next`/`react`. See the dev-toolchain carve-out in
> [`philosophy.md`](https://github.com/ingram-technologies/nextkit/blob/main/docs/philosophy.md).

## Install

```sh
bun add -d @ingram-tech/nk-dev
bun x nk init
bun install   # the prepare script wires the git hook
```

`nk init` writes the config files (and skips any that already exist):

| File | What |
| --- | --- |
| `.oxlintrc.json` | `extends` the shared oxlint rules (relative path — oxlint doesn't resolve package specifiers) |
| `.oxfmtrc.json` | a copy of the house format config (oxfmt has no `extends`) |
| `tsconfig.json` | `extends` `@ingram-tech/nk-dev/tsconfig/nextjs.json` + the site's own `include`/`paths` |
| `knip.json` | seed config (knip has no shareable config): gates on dependency/file hygiene, with unused exports/types off (noisy); ignores `@ingram-tech/nk-dev` |
| `.githooks/pre-commit` + `prepare` script | oxfmt format-on-commit |
| `CLAUDE.md` | the agent-guide `@import` |

It also prints a `vitest.config.ts` snippet (`mergeConfig(nextkitTestConfig, {})`
from `@ingram-tech/nk-dev/vitest`) rather than writing the file — add it only if
you test with Vitest (many sites use `bun:test`).

Everything is `extends`-based, so the house config is enforced by default but
overridable — layer your own rules on top, or replace a stub entirely (e.g. drop
in a `biome.json` instead of the oxlint/oxfmt stubs).

## The `nk` command

Point your package.json scripts at it:

```jsonc
{
	"scripts": {
		"dev": "nk dev",
		"format": "nk format",
		"lint": "nk lint",
		"check": "nk check",
		"type-check": "nk type-check",
		"test": "nk test",
		"build": "nk build"
	}
}
```

`nk` shells out to the site's own `bun x`-resolved tools (oxlint, oxfmt, Next,
tsc), so versions stay under each site's control — nk just orchestrates.

> **`nk` is optional.** It only orchestrates the standard commands; it never
> wraps or intercepts the Next.js build. Every site must stay fully buildable and
> runnable with plain `next build` / `next dev` if `nk` is removed — see the
> [`nk` carve-out](https://github.com/ingram-technologies/nextkit/blob/main/docs/philosophy.md).
> The orchestration tests in this package check that the formatter resolves to
> standard oxlint/oxfmt invocations and nothing more.

### Commands

- **`nk init`** — scaffold this project to use nextkit (see above). Idempotent:
  skips files that already exist.
- **`nk doctor [--fix]`** — report drift from the canonical nk-dev toolchain
  (superseded deps, config `extends`, package.json scripts, the agent-guide
  import, a stale `.prettierignore`, an unsealed migration chain and the DDL in
  it drizzle can't model, a page under `app/auth/` shadowing a Better Auth
  endpoint — static segments beat the `[...all]` catch-all, so such a page
  silently 405s the endpoint); `--fix` applies the auto-fixable findings.
- **`nk dev`** — start the Next dev server on the golden-path local database
  (see [`db-package.md`](https://github.com/ingram-technologies/nextkit/blob/main/docs/db-package.md)):
  - **PGlite** — if `@ingram-tech/nk-db`'s `nk-pglite-dev` bin resolves, hand off
    to it: boot Postgres-in-WASM, apply the `drizzle/` migrations, set
    `DATABASE_URL`, then `next dev --turbopack`. No Docker, no daemon.
  - **Plain** — otherwise just `next dev` (static/marketing sites with no DB).
- **`nk format` / `nk format --check`** — formats code (JS/TS/JSON/CSS) with
  oxfmt. `--check` verifies without writing (CI). SQL isn't formatted — it's
  generated (drizzle migrations, `pg_dump` baselines, pglite fixtures).
- **`nk lint`** — `oxlint`.
- **`nk knip`** — `knip` (unused dependencies / exports / files).
- **`nk migrations [--check|--reseal|--ddl]`** — guard the `drizzle/` migration
  chain, with no database involved. Verifies each file against the hashes in
  `drizzle/_seal.json` and seals newly generated ones; `--check` verifies
  without writing (what `nk check` runs); `--reseal` rewrites every hash for a
  deliberate squash; `--ddl` lists the migrations carrying DDL drizzle's
  snapshot can't model. Details in
  [`db-package.md`](https://github.com/ingram-technologies/nextkit/blob/main/docs/db-package.md#the-seal-applied-migrations-are-immutable).
  A no-op on sites without a migration journal.
- **`nk ast-grep [...]`** — structural search & rewrite of TS/TSX by AST pattern,
  via the vendored [ast-grep](https://ast-grep.github.io) (args passed through to
  it). For large mechanical refactors — import rewrites, API renames, call-shape
  changes — instead of hand-editing or `sed`. The workflow (search → preview →
  apply → `nk format` + `nk type-check`) and its syntactic-not-semantic limits
  live in the codemod skill, `skills/ts-codemod.md`.
- **`nk check`** — `oxlint` + `oxfmt --check` + `knip` (only when the repo has a
  knip config) + the agent-guide import gate + the migration seal. The CI gate;
  runs every checker and reports them all before failing.
- **`nk type-check`** — `next typegen && tsc --noEmit`.
- **`nk test [...]`** — `vitest run`, extra args passed through.
- **`nk build [...]`** — `next build`, extra args passed through.

## Exports

```jsonc
"@ingram-tech/nk-dev/oxlintrc.json"          // oxlint rules (extend via relative path)
"@ingram-tech/nk-dev/oxfmtrc.json"           // oxfmt config (copy; no extends)
"@ingram-tech/nk-dev/tier-b.json"            // stricter opt-in lint tier
"@ingram-tech/nk-dev/tsconfig/base.json"     // base TS config
"@ingram-tech/nk-dev/tsconfig/nextjs.json"   // Next.js TS config (also "/tsconfig")
"@ingram-tech/nk-dev/vitest"                 // nextkitTestConfig preset
"@ingram-tech/nk-dev/vitest/setup"           // Vitest setup (jest-dom + Next mocks)
"@ingram-tech/nk-dev/guide.md"               // the AI agent guide
```

## Why no SQL formatting?

oxfmt is the formatter for code, and it can't format SQL — but nk-dev doesn't
format SQL at all. The SQL in our repos is ~entirely generated (drizzle
migrations, `pg_dump` baselines, pglite fixtures), so formatting it only churned
generated files and crashed on psql directives (`\restrict`) for no gain. nk-dev
therefore carries no `prettier` dependency; if a site has a leftover
`.prettierignore`, `nk doctor --fix` removes it.
