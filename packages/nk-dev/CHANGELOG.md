# @ingram-tech/nk-dev

## 0.7.0

### Minor Changes

- c82fcd5: `nk doctor` now fails on any script that lets **drizzle-kit apply schema**, and
  the guide states the rule so it propagates to every site's CLAUDE.md.

  drizzle-kit is **generate-only**; `nk-pg-migrate` (`@ingram-tech/nk-db`) is the
  one runner that applies. Two commands are now flagged as errors (both
  auto-fixable with `nk doctor --fix`):

  - **`drizzle-kit push`** → the script is removed. It applies a diff straight to
    the live DB with no migration file and no journal entry — the schema-drift
    source. It has already drifted a production database in this fleet, and where
    the dev DB is shared it rewrites everyone's.
  - **`drizzle-kit migrate`** → rewritten to `nk-pg-migrate`. drizzle-kit's
    migrator is opaque: it exits non-zero with no message (even on a clean no-op)
    and hides journal drift.

  `drizzle-kit generate` is untouched — generating is the supported use.
  `findings()` is now exported from `lib/doctor.js` so checks are unit-testable.

## 0.6.1

### Patch Changes

- 8eec90d: Bump the bundled toolchain to latest: oxlint 1.73→1.74, oxfmt 0.58→0.59, knip
  6.25→6.27. No behavior change for consumers beyond the upstream tools' own fixes.
- a12c536: `nk lint` now forwards extra args to oxlint, so `nk lint --fix` (and `--quiet`,
  `--deny`, etc.) work — previously the wrapper dropped them, so autofixable rules
  (e.g. `lucide-icon-suffix`) could only be fixed by invoking `oxlint --fix`
  directly. `nk check` is unchanged (still a read-only gate).

## 0.6.0

### Minor Changes

- 320cf3c: Add `nk ast-grep` — AST-aware structural search & rewrite of TS/TSX, backed by a
  vendored [ast-grep](https://ast-grep.github.io) (`@ast-grep/cli`, resolved to the
  pinned binary rather than a global on `PATH`). Args pass straight through to
  ast-grep. Ships alongside it a codemod **skill** (`skills/ts-codemod.md`) that the
  agent guide points to, teaching the search → preview → apply → `nk format` +
  `nk type-check` workflow and its syntactic-not-semantic limits — so large
  mechanical refactors (import rewrites, API renames, call-shape changes) stop being
  hand-edited file by file. Purely additive; no existing command changes.
- 3b500ea: Add three custom oxlint rules to the shared `nextkit` plugin, ported from the
  Ingram ESLint recommended set and adapted for oxlint (all `warn`):

  - `nextkit/no-redundant-usestate-type` — strips `useState<T>` type arguments
    that TypeScript already infers from the initial value (autofix). Narrower than
    the upstream rule: it skips `null` initial values (a runtime change, not a
    redundancy) and array annotations (`useState<string[]>([])` is load-bearing —
    `useState([])` infers `never[]`), both of which the upstream autofix silently
    broke.
  - `nextkit/lucide-icon-suffix` — enforces the `Icon` suffix on `lucide-react`
    imports and rewrites references (autofix), matching lucide's own deprecation
    of the bare aliases. Inert on sites that don't import lucide; skips the
    package's non-icon exports.
  - `nextkit/no-redirect-only-page` — suggests a `next.config` redirect for an App
    Router `page.tsx` whose only job is to call `redirect(...)`, with the config
    entry inlined in one diagnostic. Now validates every page shape (including
    `export default function`), closing a false-positive the upstream rule had on
    function-declaration pages.

  The Supabase rules and the opinionated `nextjs-page-pattern` rule from the
  upstream set were intentionally not ported.

### Patch Changes

- 3ac010f: Invoke the site toolchain via `bun x` instead of the `bunx` shim. On some
  installs — notably Windows and Git's bundled `sh`, where the `.githooks/pre-commit`
  hook runs — only `bun` lands on `PATH` while the standalone `bunx` shim does not.
  `bunx` is an alias for `bun x`, so spawning `bun x` works in a strict superset of
  environments with identical behavior. Updated the pre-commit hook template
  (`nk init`), `format-staged` (oxfmt), and the `nk` command runner (`dev`, and the
  generic tool runner); the ENOENT hint now points at `bun`.

  Note: `nk init` writes the hook string into each site's committed
  `.githooks/pre-commit`, so existing sites keep the old `bunx` line until they
  re-run `bun x nk init` (or edit the one line by hand).

## 0.5.0

### Minor Changes

- fe5bf9d: New oxlint rule `nextkit/no-deferred-current-target` (error, fleet-wide): bans reading `event.currentTarget` inside a callback nested in the event handler. React nulls `currentTarget` once the handler returns, so a read inside a setState updater, setTimeout, or promise chain crashes intermittently at runtime, and tsc cannot catch it (the typings declare it non-null). Fix pattern: capture the needed value into a local in the handler body and close over that. The `@ingram-tech/nk-dev/oxlint-plugin` export now resolves to an index merging all nextkit rules.

## 0.4.1

### Patch Changes

- 4615f9d: Fix `nk type-check` breaking on Next.js sites under TypeScript 7. `typescript@7`
  (the native compiler) ships no JS compiler API — no `lib/typescript.js` — so
  Next's `next typegen` decided TypeScript "wasn't installed" and tried to
  auto-install it with whatever package manager it sniffed (vercel/next.js#95490).
  nk-dev now follows the official side-by-side guidance from the TypeScript 7.0
  announcement: `typescript` is aliased to `@typescript/typescript6` (the 6.x API
  that Next and other API consumers require), while `@typescript/native` (aliased
  `typescript@7`) keeps providing the `tsc` bin, so `nk type-check` still runs the
  native compiler. Sites declaring their own `typescript` devDependency should
  remove it or adopt the same alias pair — a bare `typescript@7` reintroduces the
  breakage, and a bare `typescript6` alias leaves no `tsc` bin (bunx would then
  fetch the npm `tsc` squatter package).

## 0.4.0

### Minor Changes

- 283a14e: Bundle TypeScript 7 (`typescript@^7.0.2`), the native compiler. `nk type-check`
  and every `tsc` invocation orchestrated by `nk` now run the Go-based tsc —
  substantially faster, and a drop-in replacement for the 6.x CLI. TypeScript 7 is
  a major release, so sites may surface new (correct) type errors after upgrading;
  plain `next build` / `next dev` remain unaffected. Also bumps bundled knip to
  ^6.25 and vitest to ^4.1.10.

## 0.3.0

### Minor Changes

- 79bcb7d: Toolchain consolidation:

  - **`nk` no longer formats SQL.** `nk format`/`nk check` run oxfmt only; the `prettier` + `prettier-plugin-sql` dependencies are dropped. SQL in these repos is ~all generated (drizzle migrations, `pg_dump` baselines, pglite fixtures), so formatting it only churned generated files and crashed on psql directives (`\restrict`) for no gain.
  - **`nk test`** — new passthrough for `vitest run` (extra args forwarded), completing the set alongside `lint`/`format`/`check`/`type-check`/`build`.
  - **`nk doctor [--fix]`** — reports a site's drift from the canonical nk-dev toolchain (scripts not pointing at `nk`, superseded deps, `.oxlintrc.json`/`tsconfig.json` extends not pointing at nk-dev, a missing CLAUDE.md guide import, stale `knip.json` ignores, a dead `.prettierignore`) and, with `--fix`, applies the mechanical corrections. Exits non-zero on model-breaking findings so it can gate CI.
  - **`nk check` warns on tooling drift** — a non-fatal notice when a site re-declares a package nk-dev supersedes (`oxfmt`, `oxlint`, `prettier*`, `@ingram-tech/{oxlint,typescript}-config`, `@ingram-tech/nk-cli`, `@ingram-tech/git-hooks`), pointing at `nk doctor --fix`.

### Patch Changes

- c8df237: Bump the bundled oxc toolchain: oxfmt `^0.56` → `^0.58`, oxlint `^1.71` → `^1.73`. Sites on the nk-dev toolchain pick these up on their next install, so the whole fleet's formatter/linter version is managed here in one place rather than pinned per repo.

## 0.2.5

### Patch Changes

- d430473: Pre-commit hook and exit-code correctness:

  - **`format-staged` no longer commits unstaged hunks.** `oxfmt --write` rewrites the working tree and the re-`git add` swept everything into the commit — including hunks deliberately left out with `git add -p`. Partially staged files are now skipped with a warning.
  - **Non-ASCII filenames are formatted again.** `git diff --name-only` octal-escapes them (`"\303\251 test.ts"`), which matched no real path, so such files were silently never formatted or re-staged; same fix in `nk format`'s SQL file listing. Both now use `-z`/NUL splitting.
  - **Signal-killed tools fail the gate.** `run()`/`nk dev` treated a `null` exit status (OOM-kill, SIGSEGV) as success, letting a crashed linter pass `nk check`.
  - `nk check` reads the SQL result from `formatSql`'s return value instead of the `process.exitCode` global (which misattributed any earlier failure to SQL); SQL formatting defaults carry the house `tabWidth: 4` / `printWidth: 88` (Prettier's own 80/2 applied before); deleted-but-tracked `.sql` files no longer crash `nk format`; the hook uses `existsSync` instead of spawning the Unix `test` binary per file; the unused `capture()` helper is gone; usage text no longer claims the no-database path is "plain dev" (it runs Turbopack).

## 0.2.4

### Patch Changes

- beb294e: Remove the `@supabase/supabase-js` `no-restricted-imports` rule from the tier-b
  oxlint config — the fleet no longer uses supabase-js, so the guardrail is moot.
  The `pg` `Pool`/`Client` restriction (use `createPool` from nk-db) is unchanged.

## 0.2.3

### Patch Changes

- e13c8b9: `nk init`'s seed `knip.json` now encodes the house knip policy: gate on
  dependency/file hygiene (unused files/deps, unlisted, unresolved) and turn off
  unused exports/types (noisy, usually intentional API surface). Previously the
  seed had no `rules`, so a fresh `nk init` produced a config that failed knip on
  unused exports.

## 0.2.1

### Patch Changes

- 95a6b49: Make the shared TypeScript base emit valid Node ESM and enforce it. The base
  preset (`@ingram-tech/nk-dev/tsconfig/base.json`) used `moduleResolution:
"bundler"`, which silently tolerates extensionless relative imports in
  `"type": "module"` packages and emits them verbatim — invalid under Node ESM /
  Turbopack, and a recurring source of `ERR_MODULE_NOT_FOUND` ("Cannot find
  module './x'"). Switched the base to `module`/`moduleResolution: "nodenext"`, so
  tsc now errors (TS2835) on any extensionless relative import.

  This surfaced the same latent defect in three packages, now fixed by adding
  explicit `.js` extensions to their relative imports: nk-i18n, newsletter, and
  nk-auth (their published `dist` previously shipped extensionless ESM).

  App consumers are unaffected: the Next.js preset (`nextjs.json`) overrides back
  to `moduleResolution: "bundler"`, so app source still needs no `.js` extensions.
  nk-auth also overrides to "bundler" because it imports `next/server` /
  `next/headers` / `next/navigation`, whose type exports don't resolve under
  NodeNext — its relative imports still carry `.js`, so its dist is valid ESM.

## 0.2.0

### Minor Changes

- bd15153: Add **knip** to the bundled toolchain and run it under `nk check`.

  - knip is now a hard dependency of nk-dev. New **`nk knip`** command, and
    **`nk check`** runs knip as part of the gate — but only when the repo has a
    knip config present (knip has no shareable config, so config-presence is the
    opt-in; sites that haven't adopted knip aren't suddenly gated).
  - `nk init` now scaffolds a seed `knip.json` (ignoring `@ingram-tech/nk-dev`).

  Also two fixes found during fleet rollout:

  - `nk init` no longer writes a `vitest.config.ts` unconditionally — it prints the
    snippet as a hint instead. Many sites test with `bun:test`, where an unused
    Vitest config is just noise.
  - The `to-nk-dev` codemod now also migrates `knip` config (`knip.json` and the
    package.json `knip` key): it swaps the old config-package names for
    `@ingram-tech/nk-dev` in `ignoreDependencies`, and rewrites
    `oxlint-config/{oxfmtrc,tier-b}.json` extends references (not just `oxlintrc`).

## 0.1.0

### Minor Changes

- New package: **`@ingram-tech/nk-dev`** — the entire nextkit dev toolchain in one
  `devDependency`. It is the renamed and expanded `@ingram-tech/nk-cli`, and it
  absorbs the previously separate dev-time packages:

  - `@ingram-tech/oxlint-config` → `@ingram-tech/nk-dev/oxlintrc.json` · `/oxfmtrc.json` · `/tier-b.json`
  - `@ingram-tech/typescript-config` → `@ingram-tech/nk-dev/tsconfig/base.json` · `/tsconfig/nextjs.json`
  - `@ingram-tech/test-config` → `@ingram-tech/nk-dev/vitest` · `/vitest/setup`
  - `@ingram-tech/git-hooks` → the `nextkit-format-staged` bin (unchanged)
  - `@ingram-tech/agent-guide` → `@ingram-tech/nk-dev/guide.md`

  The toolchain itself (oxlint, oxfmt, typescript, vitest, jsdom, jest-dom) ships as
  hard dependencies, so a single `bun add -d @ingram-tech/nk-dev` pulls the whole
  stack. A new **`nk init`** command scaffolds a site's `.oxlintrc.json`,
  `.oxfmtrc.json`, `tsconfig.json`, `vitest.config.ts`, the format-on-commit hook,
  and the CLAUDE.md agent-guide import — all `extends`-based, so the house config is
  enforced by default yet overridable.

  This is the dev-time half of the runtime/dev split documented in
  `docs/philosophy.md`; runtime packages (`email`, `nk-db`, `nk-auth`, …) stay
  separate. Migrate existing sites with `scripts/codemods/to-nk-dev.mjs` (see
  `docs/oxlint-migration.md`). The old split packages and `nk-cli` are superseded
  and should be deprecated on npm.

> Formerly **`@ingram-tech/nk-cli`**. nk-dev absorbs the `nk` CLI together with
> the old `@ingram-tech/oxlint-config`, `typescript-config`, `test-config`,
> `git-hooks`, and `agent-guide` packages into one dev-toolchain package. Earlier
> `nk-cli` releases are kept below for history.

## 0.3.0 (as @ingram-tech/nk-cli)

### Minor Changes

- c474d3d: Drop the swappable formatter backend — `nk` is now hard-wired to oxc (oxlint +
  oxfmt). The `{ "nk": { "formatter": "biome" } }` escape hatch is gone, along with
  the `nk` package.json config block it was the only consumer of. Sites still on
  Biome must drive `biome` through their own package.json scripts rather than via
  `nk`. SQL still formats through bundled Prettier, unchanged.

## 0.2.0

### Minor Changes

- Default the formatter to **oxc** (oxlint + oxfmt). `nk format` / `nk lint` / `nk check` now invoke oxfmt and oxlint; SQL still formats through the bundled Prettier. Biome stays fully wired as a fallback — opt in with `{ "nk": { "formatter": "biome" } }`. `nk check` runs lint and format-check as separate passes (oxc splits them across two tools) and reports both before failing.
- `nk check` now gates the agent-guide import: if a site depends on `@ingram-tech/agent-guide` but its CLAUDE.md doesn't `@import` the guide, the check fails with a fix-it message.
- `nk dev` now boots the golden-path local database via `@ingram-tech/nk-db` (PGlite — Postgres in WASM, no Docker) when installed, else plain `next dev`. **`nk dev` no longer boots local Supabase** — sites still on Supabase must start it themselves.

## 0.1.0

### Minor Changes

- 26e6d73: New package: `nk`, the nextkit CLI. `nk dev` starts Next and boots local Supabase first (wiring its env in) when `supabase/config.toml` is present — replacing per-site `dev.sh`. Adds `nk format` (Biome for code, Prettier for SQL — bundled, so Prettier never lands in app deps), plus `lint` / `check` / `type-check` / `build`. The code formatter sits behind a small indirection so it can move to oxc later via `{ "nk": { "formatter": "oxc" } }`.
