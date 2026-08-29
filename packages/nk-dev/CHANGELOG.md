# @ingram-tech/nk-dev

## 0.14.0

### Minor Changes

- 50efdf8: `nk doctor` warns when a site binds `createAuthHelpers` but nothing sets the
  `x-nk-auth-path` header (neither `createAuthMiddleware` nor
  `withAuthPathHeader`): the guards' `?next=` is lost silently in that shape.
  `guide.md` names the composable nk-auth middleware pieces.

## 0.13.1

### Patch Changes

- 32ee4ca: Update `guide.md` for nk-forms 0.3.0, which absorbed `@ingram-tech/bot-protection`.
  The shipped guide still listed bot-protection in its package roster as "the
  primitive nk-forms builds on" and told agents to import `checkBot` / `verifyHuman`
  from it for non-form endpoints. That package no longer exists; both layers are
  exported from the `@ingram-tech/nk-forms` root.
  
  The repo was corrected when the packages merged, but that changeset bumped only
  nk-forms, so the fix never reached npm — agents on nk-dev 0.13.0 were reading the
  old roster. `guide.md` describes packages other than its own, so a change to any
  package's public surface needs a nk-dev changeset alongside it.
- 798b39d: Rewrite the READMEs for an outside reader. These packages are published under an
  open-source licence, but the prose addressed the reader as if they worked here:
  "the Ingram billing foundation", "every Ingram API looks the same", "the one
  shared email client for Ingram sites", "the fleet-uniform view". That framing is
  gone, along with the pose it came with — unsourceable claims ("the one SEO
  safeguard everyone forgets on Vercel"), negation-reframes, bold scattered on
  non-key phrases, and roughly forty mid-sentence em-dashes.
  
  Documented failure modes, gotchas and code examples are unchanged. No API,
  identifier, env var or technical claim was touched.

## 0.13.0

### Minor Changes

- c9307ad: `nk type-check` starts cold when the dependency tree moved: a `*.tsbuildinfo`
  older than `bun.lock` / `package.json` is dropped before the run, because
  `tsc --incremental` does not reliably re-check a program after a dependency's
  `.d.ts` changes and a green result against the stale cache means nothing.
  `--cold` drops the cache unconditionally. `nk doctor` now flags a `"prettier"`
  key in `package.json` and `.prettierrc*` files alongside `.prettierignore`
  (all `--fix`able), and warns when a site has no `ci` script or one that skips
  `nk check` / `nk type-check`.

## 0.12.2

### Patch Changes

- 9314bf5: Guide: session ids come in public form from `createAuthHelpers(auth, { ids })`.

## 0.12.1

### Patch Changes

- 03061d8: `nk type-check` (and every other captured tool run) no longer dies with
  `spawnSync bun ENOBUFS` when the tool prints more than Node's 1 MiB default —
  which a `tsc` run with a few thousand errors does, i.e. exactly the run whose
  output matters. `maxBuffer` is now 256 MiB.

## 0.12.0

### Minor Changes

- 9278f83: New lint `nextkit/no-id-codec-in-app-code` (warn): flags the bare codec
  functions (`encodeId`, `decodeId`, `decodeAnyId`, `toPrefixedId`,
  `fromPrefixedId`) imported from `id758` / `@ingram-tech/nk-db/id`, and
  `ids.<entity>.encode()` / `.decode()` / `.decodeOrNull()` calls, outside
  `ids.ts` / `id.ts` / `schema.ts` and tests. With nk-db 2's symmetric
  `idColumn` and the `id758_*` Postgres functions, application code handles
  public ids only; the lint lists every remaining hand conversion. `.is()`,
  `.mint()` and `.prefix` are fine.
  
  The guide gains the matching rule.

## 0.11.1

### Patch Changes

- e5a6f40: `no-crypto-random-uuid` now points at `uuidv7()` from `id758`.

## 0.11.0

### Minor Changes

- f953443: New `nk doctor` check: a page or route under `app/auth/` that shadows a Better
  Auth endpoint. nextkit sites mount Better Auth at `/auth` through the
  `[...all]` catch-all, and sign-in pages live in the same namespace — but in the
  App Router a static segment always beats a catch-all, so a page whose path
  matches an endpoint silently takes it over: GETs render the page, POSTs to the
  endpoint return 405, and the auth flow breaks with no build-time signal. The
  incident class is real — a reset page named `/auth/reset-password` shadows
  `POST /auth/reset-password`, which is why the convention is to name that page
  `/auth/set-password`.
  
  The check derives the endpoint list textually from the installed better-auth's
  `dist/api/routes` (`createAuthEndpoint("...")` — no site or dependency code is
  executed), maps the `app/auth/**` tree to URL paths (`(group)` stripped,
  `_private` and `@slot` trees skipped, `[param]` as a wildcard), and matches
  segment-wise with endpoint `:param` wildcards. Core-endpoint collisions are
  errors; `dist/plugins` collisions are warnings, since only enabled plugins are
  live and we can't tell which without executing the auth config. Sites without
  the `[...all]` mount or without better-auth are silently skipped, and a
  better-auth dist layout we can't grep degrades to a warning, never a hard
  error.
  
  This is a doctor check, not an oxlint rule, because the collision is a property
  of the route *tree* against a dependency's dist — no single file's AST contains
  it.
- f2c9d94: New oxlint rule `nextkit/no-redundant-node-crypto` (warn): flags the
  `node:crypto` imports that are already on the Web Crypto global — `randomUUID`,
  `getRandomValues`, `subtle` and `webcrypto`. Each pins a module to a Node-only
  runtime for something it would have had regardless, and `subtle`/`webcrypto`
  aren't even different objects from `globalThis.crypto.subtle`/`globalThis.crypto`.
  Catches named imports, and member access through a namespace or default import
  of the module. The rest of `node:crypto` (`createHash`, `createHmac`,
  `randomBytes`, `timingSafeEqual`, …) has no drop-in global and is left alone, so
  the usual fix is trimming one name off an import list.
  
  This makes fleet-wide the invariant nk-db's id codec already holds by hand — its
  `id.ts` is pinned to an empty import list by a test whose comment names
  `node:crypto` for randomness as the tempting one, because a single Node-only
  import there would make every module that touches an id Node-only.
  
  Not autofixable: the call sites have to become member expressions on the global,
  and an import named `crypto` shadows the global it stands in for. Keep an import
  with a justified disable — `node:crypto`'s `randomUUID` takes a
  `disableEntropyCache` option that Web Crypto's does not.
- 6c34702: Guard the drizzle migration chain: `nk migrations` and two new `nk doctor` findings.
  
  Applied migrations are immutable — the runner records `sha256(file)`, so editing
  one after it has run drifts every database that applied it, and drizzle never
  looks at the file again to notice. `nk migrations` pins each file's hash in a
  committed `drizzle/_seal.json` and `nk check` fails on a mismatch, so the edit
  surfaces in the PR that made it instead of on the next deploy. `--reseal` is the
  deliberate-squash escape hatch, and its effect is visible in the diff.
  
  `nk migrations --ddl` (and a `nk doctor` finding) lists the migrations carrying
  DDL drizzle's snapshot cannot model — functions, triggers, `DEFERRABLE`
  constraints, grants, roles, extensions, materialized views. Those are outside
  `db:generate`'s diff basis entirely, so a clean generate does not mean the chain
  reproduces the database, and anything regenerated from `schema.ts` drops them.
  
  Both run without a database. `nk doctor` also seals an unsealed chain on `--fix`.

### Patch Changes

- 2b21f3a: Toolchain bumps, which nk-dev ships as real dependencies and therefore pins for
  the whole fleet: oxlint 1.78.0, oxfmt 0.63.0, knip 6.32.2, `@ast-grep/cli`
  0.45.1, `@testing-library/jest-dom` 7.0.1. No new oxlint rule fires on this
  repo and no formatting changed, so consuming sites should see a silent upgrade.

## 0.10.0

### Minor Changes

- 2622128: Move the bundled DOM test environment to `jsdom` ^30.0.1, and declare the Node
  version it actually needs.

  jsdom 30's only breaking change is a raised Node floor:
  `^22.22.2 || ^24.15.0 || >=26.0.0`. `nk-dev` still advertised `>=20`, which is
  now a promise it can't keep — installing on Node 20 would succeed and then fail
  at runtime inside `nk test` with a jsdom error that says nothing about Node.
  `engines.node` mirrors jsdom's range verbatim rather than approximating it: the
  range is deliberately gappy (23.x and 24.0–24.14 are excluded), so `>=22.22.2`
  would let through versions jsdom rejects.

  Sites on Node 24.15+ or 26 are unaffected. The test suite passes untouched
  across the upgrade.

- 3bdaadf: `nk type-check` now recovers from damaged generated types, and `nk clean`
  removes regenerable build artifacts.

  `tsconfig.json` feeds Next's typed-routes output back into `tsc`. Killing
  `next dev` mid-write leaves `.next/dev/types/validator.ts` truncated, and
  `next typegen` does **not** repair that directory — it writes `.next/types` —
  so `tsc` reports the same syntax error inside `.next/` on every subsequent run.
  The error points at generated code, so the natural response is to hunt a type
  error in `src/` that doesn't exist.

  Worse, a syntax error in generated output suppresses semantic diagnostics
  program-wide: real `src/` errors are hidden behind it. Confirmed against a
  truncated validator, where `tsc` reported only the generated file while a
  planted `src/` type error went unmentioned.

  `type-check` now captures the first `tsc` run and, when **every** reported
  error sits inside generated type output, cleans the artifacts, regenerates and
  retries once. A run that also implicates `src/` is passed through untouched:
  cleaning wouldn't fix those errors, and the retry would only cost a full `tsc`
  pass. Recovery never turns a failing check into a passing one — it surfaces the
  errors that were masked and still exits non-zero.

  The artifact registry behind it is shared, and exposed as `nk clean` for manual
  use: Next's generated types plus TypeScript incremental caches, the latter
  discovered by extension rather than by fixed name (`tsBuildInfoFile` renames
  them, and a repo can carry several). Only the generated _type_ output is
  removed — `.next/cache` is left alone, so recovery doesn't become a cold
  rebuild.

- cb49779: New oxlint rule `nextkit/satori-css` (warn): validates inline styles in
  satori-rendered JSX — the properties `next/og` accepts from
  `React.CSSProperties` but satori silently drops, `calc()`, and the two
  structural rules satori throws on (a multi-child node needs an explicit
  `display`, text can't sit beside element siblings). Scoped to files importing
  `next/og`/`@vercel/og` or named `opengraph-image`/`twitter-image`, and
  deliberately conservative: conditional children and non-literal styles are left
  alone. Closes the gap render tests can't see — a dropped property still yields a
  valid PNG, just the wrong one.

### Patch Changes

- ba5df61: Move the vendored structural-search binary to `@ast-grep/cli` ^0.45.0.

  0.45 deprecates the `sg` command alias, which `nk ast-grep` never used — it
  resolves the native `ast-grep` binary through `resolveBinaryPath`, so the
  passthrough is unaffected. Also in this release: ignore files outside
  `rule_dirs` are no longer consulted during scans.

- 6cf2320: Raise runtime dependency floors to the current patch/minor releases.

  `nk-auth` moves to `jose` ^6.2.6, `nk-billing` to `stripe` ^22.4.0, `nk-i18n` to
  `intl-messageformat` ^11.2.13, and `nk-dev` to `oxlint` ^1.76.0, `knip` ^6.31.0
  and `@testing-library/jest-dom` ^6.10.0.

  No API changes. `nk-dev` ships the toolchain as real dependencies, so its bump
  is what moves a consuming site's linter and dead-code checker — the new `oxlint`
  reported no findings against this repo.

- 24247fd: Move to `@testing-library/jest-dom` ^7.0.0, and bundle its new peer.

  jest-dom 7 promotes `@testing-library/dom` to a required peer dependency with
  no `peerDependenciesMeta.optional`. `nk-dev` now depends on it directly rather
  than leaving every site to satisfy it: `nk-dev` already ships the test
  toolchain (vitest, jsdom) as real dependencies, and the alternative is an
  unmet-peer warning on install for any site that doesn't happen to pull
  `@testing-library/react`.

  The shipped `vitest/setup.ts` still imports cleanly, and 7.0.0 adds
  `toContainAnyBy*` / `toContainOneBy*` matchers. jest-dom 7 also raises its Node
  floor to 22, which the jsdom 30 `engines` change already covers.

- 61fc5e0: Move the bundled formatter to `oxfmt` ^0.61.0.

  No source file in this repo reformats across the bump, so a consuming site
  should see no diff either. 0.61 adds a YAML formatter, but it does not claim
  `.yml` files on its own — `oxfmt --check .` matches the same set it did before,
  and `.github/workflows` is untouched.

## 0.9.0

### Minor Changes

- e202a89: Add `nextkit/no-crypto-random-uuid` (warn): keep UUIDv4 off the id write path.

  nextkit ids are UUIDv7, so inserts land at the right edge of the primary-key
  B-tree instead of scattering across it. One call site minting a stored id with
  `crypto.randomUUID()` fragments that index while every other row stays ordered,
  and the damage is invisible until the table is large enough that fixing it is
  expensive. The rule flags `crypto.randomUUID()`, `globalThis.crypto.randomUUID()`
  and `randomUUID` imported from `node:crypto`, pointing at `uuidGenerateId()` from
  `@ingram-tech/nk-db/id` — or at dropping the mint entirely, since a column with
  `default uuidv7()` already does it.

  Deliberately not autofixable, because one of the correct answers is "leave it
  alone". UUIDv7 is the wrong choice for a secret: it spends 48 bits on a
  millisecond timestamp, leaving 74 random bits against v4's 122, and it leaks its
  own creation time to whoever holds it. Bearer tokens, OAuth `state` and reset
  links stay v4 behind a justified disable comment rather than being "fixed" into
  weaker values.

  Test files are exempt through a new `overrides` block in the shared oxlintrc:
  test rows are ephemeral, so index locality is meaningless there and the
  zero-import global keeps fixtures readable.

## 0.8.0

### Minor Changes

- 694ffea: Add two oxlint rules for `@ingram-tech/nk-i18n` translator calls.

  `nextkit/t-requires-values` (error) flags a `t()` message whose ICU placeholders
  have no values argument, or whose values object literal omits a required key.
  The translator returns the message unformatted when no values are given, so
  `t("Results for {query}")` renders the placeholder text to users with no runtime
  warning at all — the one failure in that package with no signal behind it.

  `nextkit/t-no-positional-args` (error) forbids numbered placeholders (`{0}`).
  The English source is the catalog key, so a translator reads the placeholder and
  may need to reorder it; a number tells them nothing.

  Both read arguments with a brace-depth scan, so only top-level braces count:
  `{count, plural, one {# item} other {# items}}` has exactly one argument. Braces
  that don't open with an identifier are treated as text and ignored, leaving
  prose and embedded JSON (`t('This is JSON: {"a": 1}')`) untouched — messages that
  can't be ICU-escaped anyway, since the source string is the catalog key.

### Patch Changes

- d6cd33a: Agent guide: data migrations must assert how much data they moved.

  A backfill that silently moves nothing — an RLS mask on the source table, a
  wrong `where` — commits and reports success. When the same migration then drops
  the source columns, the data is gone. The rule is a row-count assertion inside
  the transaction: count the expected rows, compare against `get diagnostics`
  `row_count`, `raise exception` on a mismatch.

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
