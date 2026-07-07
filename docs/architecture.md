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
  .oxlintrc.json          # dogfoods @ingram-tech/nk-dev (lint)
  .oxfmtrc.json           # house format config (oxfmt has no "extends")
  tsconfig.json           # dogfoods @ingram-tech/nk-dev (tsconfig)
  .githooks/pre-commit    # dogfoods @ingram-tech/nk-dev (format hook)
  .changeset/             # release config
  docs/                   # this directory — AI-facing docs
  packages/
    nk-dev/               # @ingram-tech/nk-dev              (dev toolchain)
    nk-email/             # @ingram-tech/nk-email            (runtime)
```

## Package categories

- **The dev toolchain** (`nk-dev`): one package holding everything dev-time —
  the oxlint/oxfmt, TypeScript, and Vitest config files sites *extend* (or, for
  oxfmt, copy); the `nextkit-format-staged` git-hook bin; the agent `guide.md`;
  and the `nk` CLI (`bin` + `lib`). No build step. `nk init` scaffolds a site.
  See [`philosophy.md`](./philosophy.md) for why dev-time config is one bundle
  while runtime stays vertical slices.
- **Runtime packages** (`nk-email`, `nk-db`, `nk-auth`, `nk-billing`, `nk-api`,
  `nk-i18n`, `nk-seo`, `nk-blog`, `bot-protection`, `nk-marketing`): ship
  compiled JS + `.d.ts` from `src/`, built with `tsc`. These stay separate and
  peer-depend on `next`/`react`.

## How consumption works (the thin-wrapper mechanism)

Nothing here is magic — every integration point is a standard Next.js / tooling
extension. `nk init` writes these once; thereafter they are the site's own files.

| Concern | Mechanism in the consuming site |
| --- | --- |
| Lint | `.oxlintrc.json` → `"extends": ["./node_modules/@ingram-tech/nk-dev/oxlintrc.json"]` (oxlint resolves relative paths, not package specifiers) |
| Format | `.oxfmtrc.json` — a copy of `@ingram-tech/nk-dev/oxfmtrc.json` (oxfmt has no `extends`), or `oxfmt -c` that path |
| TypeScript | `tsconfig.json` → `"extends": "@ingram-tech/nk-dev/tsconfig/nextjs.json"` |
| Tests | `vitest.config.ts` → `mergeConfig(nextkitTestConfig, …)` from `@ingram-tech/nk-dev/vitest` |
| Git hooks | `.githooks/pre-commit` → `bunx nextkit-format-staged` |
| Agent guide | `CLAUDE.md` → `@./node_modules/@ingram-tech/nk-dev/guide.md` |
| Email | `import { sendEmail } from "@ingram-tech/nk-email"` |

A new Next.js dev sees only standard config files pointing at `@ingram-tech/*`
packages. That is the whole point.

## Dogfooding

nextkit uses nk-dev's own config on itself (note the `extends` pointing at the
local workspace path in the root `.oxlintrc.json` / `tsconfig.json`; the root
`.oxfmtrc.json` mirrors the shared oxfmt config, since oxfmt has no `extends`).
If a config change breaks nextkit's own CI, it would break consumers too — so we
feel it first.

## Versioning & release

- Every change that affects a published package needs a Changeset
  (`bun run changeset`).
- `bun run version-packages` consumes changesets into version bumps +
  changelogs; `bun run release` builds, publishes (`scripts/publish.ts`), then
  tags (`changeset tag`).
- **Publishing does not use `changeset publish`.** It shells out to `npm
  publish`, which can't resolve bun's `workspace:` protocol, so a package with a
  *runtime* workspace dep (e.g. nk-marketing → nk-email) would ship an
  uninstallable `workspace:^` range. `scripts/publish.ts` resolves those ranges
  from each package's `package.json` version — the source of truth, immune to a
  stale `bun.lock` — and refuses to publish anything still carrying a
  `workspace:` range.
- Consumers receive updates via Renovate PRs. Keep changes additive; ship a
  codemod with any breaking major.
