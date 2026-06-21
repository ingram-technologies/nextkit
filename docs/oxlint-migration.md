# Migrating to @ingram-tech/nk-dev

How a consuming site moves onto [`@ingram-tech/nk-dev`](../packages/nk-dev) — the
single dev-toolchain package — from either of the two earlier states:

- the **split packages**: `@ingram-tech/oxlint-config`, `typescript-config`,
  `test-config`, `git-hooks`, `agent-guide`, and the `nk-cli`; or
- **`@ingram-tech/biome-config`** (the pre-oxc Biome config).

There's a codemod that does the mechanical parts; this doc explains what it does
and the few things to check by hand. For a brand-new site, skip the codemod and
use [`adopting-nextkit.md`](./adopting-nextkit.md) (`bun add -d @ingram-tech/nk-dev && nk init`).

## Why one package

The whole dev-time toolchain is now one `devDependency`: oxlint + oxfmt config,
the TypeScript presets, the Vitest preset, the format-on-commit hook, the agent
guide, and the `nk` CLI. It's all devDependencies — none of it ships to the app —
and the fleet wants the same toolchain everywhere, so bundling removes the
"install six packages and wire each one" friction. The house style and rule
intent are unchanged (oxc: tabs / width 4 / line 88; SQL still formats through
Prettier inside `nk`). See the dev-toolchain carve-out in
[`philosophy.md`](./philosophy.md).

## Run the codemod

From the site root:

```bash
bunx --bun https://raw.githubusercontent.com/ingram-technologies/nextkit/main/scripts/codemods/to-nk-dev.mjs
bun install
bunx nk init        # fills in any config file the codemod couldn't infer
bun run check
```

The codemod, all in the current directory:

1. **package.json** — removes the old `@ingram-tech/*` dev packages (and
   `@biomejs/biome`), adds `@ingram-tech/nk-dev`, and rewrites any direct
   `biome …` scripts (`biome lint .` → `oxlint`, `biome check .` →
   `oxlint && oxfmt --check`, etc.). Sites that drive everything through `nk`
   have no `biome` scripts to rewrite.
2. **Rewrites `extends` / import paths** to the new package:
   - `.oxlintrc.json` → `./node_modules/@ingram-tech/nk-dev/oxlintrc.json`
   - `tsconfig.json` → `@ingram-tech/nk-dev/tsconfig/{base,nextjs}.json`
   - `vitest.config.*` → `@ingram-tech/nk-dev/vitest` (and `/vitest/setup`)
3. **CLAUDE.md** — repoints the agent-guide `@import` to
   `@ingram-tech/nk-dev/guide.md`.
4. Creates a missing `.oxlintrc.json` / `.oxfmtrc.json`, and deletes a leftover
   `biome.json`.

It is idempotent — safe to run twice — and leaves anything it can't infer (e.g. a
missing `tsconfig.json` or `vitest.config.ts`) to `nk init`.

## Two gotchas the tooling handles (but you should know)

- **oxlint `extends` takes a *relative path*, not a package specifier.** Biome
  let you write `"extends": ["@ingram-tech/biome-config/biome.json"]`; oxlint
  resolves paths relative to the config file, so it must be
  `"extends": ["./node_modules/@ingram-tech/nk-dev/oxlintrc.json"]`. (TypeScript,
  by contrast, *does* resolve a package specifier, so the tsconfig stays
  `"extends": "@ingram-tech/nk-dev/tsconfig/nextjs.json"`.)
- **oxfmt has no `extends`.** The house format config is *copied* into a local
  `.oxfmtrc.json` rather than referenced. It's tiny and stable, so it rarely
  drifts; if you'd rather always track the package, run
  `oxfmt -c ./node_modules/@ingram-tech/nk-dev/oxfmtrc.json` instead.

## By hand (coming from Biome): suppression comments

Any inline `// biome-ignore lint/<rule>: reason` must become an oxlint directive:

```ts
// biome-ignore lint/suspicious/noThenProperty: deliberate thenable
// →
// oxlint-disable-next-line unicorn/no-thenable -- deliberate thenable
```

The rule id changes (oxlint uses ESLint-style `<plugin>/<rule>` names) and the
reason follows a `--` separator. `bun run check` will tell you which lines still
need it — and an unjustified `oxlint-disable` should fail review, same hard rule
as before (see [`code-style.md`](./code-style.md)).

## Expect a small one-time format diff (coming from Biome)

oxfmt is Prettier-compatible, which differs cosmetically from Biome in a couple
of places — most visibly, it doesn't double-indent binary-expression
continuations, and it collapses short multi-line `import`/`export` lists that fit
on one line. The first `oxfmt --write` will reformat those. It's mechanical and
safe; commit it on its own if you want a clean diff.

## `nk` users

`nk format` / `nk lint` / `nk check` invoke oxfmt + oxlint automatically. There is
no Biome fallback in `nk`: a site not ready to move off Biome must drive `biome`
directly (via its own package.json scripts) rather than through `nk`.

## Verify

```bash
bun run check     # oxlint clean + oxfmt reports all files formatted
bun run ci        # the full gate, if the site has one
```
