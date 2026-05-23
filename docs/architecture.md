# Architecture

How nextkit is laid out and how the pieces fit together.

## Monorepo, but only for the packages

nextkit itself is a single repository containing all the shared packages. The
**websites that consume nextkit are not in this repo** — they are independent
repositories that install these packages from npm. (See the topology section of
[`philosophy.md`](./philosophy.md).)

We use **Bun workspaces** for local linking and **Changesets** for versioning
and publishing. There is no Turborepo: with a handful of small, fast-building
packages, `bun run --filter '*'` is enough. Revisit only if builds get slow.

```
nextkit/
  package.json            # workspace root: scripts + dev tooling
  biome.json              # dogfoods @ingram-tech/biome-config
  tsconfig.json           # dogfoods @ingram-tech/typescript-config
  .githooks/pre-commit    # dogfoods @ingram-tech/git-hooks
  .changeset/             # release config
  docs/                   # this directory — AI-facing docs
  packages/
    biome-config/         # @ingram-tech/biome-config       (config)
    typescript-config/    # @ingram-tech/typescript-config  (config)
    test-config/          # @ingram-tech/test-config        (config)
    git-hooks/            # @ingram-tech/git-hooks           (tooling)
    email/                # @ingram-tech/email               (runtime)
```

## Package categories

- **Config packages** (`biome-config`, `typescript-config`, `test-config`):
  ship JSON/preset files that sites *extend*. No build step.
- **Tooling packages** (`git-hooks`): ship an executable bin. No build step.
- **Runtime packages** (`email`, and future `newsletter`, `bot-protection`,
  `blog`, `supabase`): ship compiled JS + `.d.ts` from `src/`, built with `tsc`.

## How consumption works (the thin-wrapper mechanism)

Nothing here is magic — every integration point is a standard Next.js / tooling
extension:

| Concern | Mechanism in the consuming site |
| --- | --- |
| Lint/format | `biome.json` → `"extends": ["@ingram-tech/biome-config/biome.json"]` |
| TypeScript | `tsconfig.json` → `"extends": "@ingram-tech/typescript-config/nextjs.json"` |
| Tests | `vitest.config.ts` → `mergeConfig(nextkitTestConfig, …)` |
| Git hooks | `.githooks/pre-commit` → `bunx nextkit-format-staged` |
| Email | `import { sendEmail } from "@ingram-tech/email"` |

A new Next.js dev sees only standard config files pointing at `@ingram-tech/*`
packages. That is the whole point.

## Dogfooding

nextkit uses its own config packages on itself (note the `extends` pointing at
local workspace paths in the root `biome.json` / `tsconfig.json`). If a config
change breaks nextkit's own CI, it would break consumers too — so we feel it
first.

## Versioning & release

- Every change that affects a published package needs a Changeset
  (`bun run changeset`).
- `bun run version-packages` consumes changesets into version bumps +
  changelogs; `bun run release` builds and publishes.
- Consumers receive updates via Renovate PRs. Keep changes additive; ship a
  codemod with any breaking major.
