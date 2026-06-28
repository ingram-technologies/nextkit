# @ingram-tech/nk-dev

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
