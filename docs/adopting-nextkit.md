# Adopting nextkit in a website

How to migrate an existing Ingram Next.js site (or set up a new one) onto
nextkit. Adopt incrementally — each step is independent and low-risk.

## 1. The dev toolchain (do this first — highest ROI, lowest risk)

The entire dev toolchain — oxlint + oxfmt, TypeScript, Vitest, the
format-on-commit hook, the agent guide, and the `nk` CLI — ships as one package,
[`@ingram-tech/nk-dev`](../packages/nk-dev). Install it, then let `nk init`
scaffold the config:

```bash
bun add -d @ingram-tech/nk-dev
bunx nk init
bun install   # the prepare script wires the git hook
```

> Already on the old split packages (`@ingram-tech/oxlint-config`,
> `typescript-config`, `test-config`, `git-hooks`, `agent-guide`) or
> `@ingram-tech/biome-config`? Run the codemod instead — see
> [`oxlint-migration.md`](./oxlint-migration.md). The steps here are for a fresh
> adoption.

`nk init` writes (and never clobbers existing files — it skips and warns):

- **`.oxlintrc.json`** — extends the shared rules. oxlint's `extends` resolves a
  **relative path**, not a package specifier, so it points into `node_modules`.
- **`.oxfmtrc.json`** — a copy of the house format config. oxfmt has no
  `extends`; the config is tiny and stable, and editors auto-discover it.
- **`tsconfig.json`** — extends `@ingram-tech/nk-dev/tsconfig/nextjs.json`
  (TypeScript *does* resolve package specifiers) with the site's own
  `include`/`exclude`/`paths`.
- **Vitest** — `nk init` prints a `vitest.config.ts` snippet
  (`mergeConfig(nextkitTestConfig, {})` from `@ingram-tech/nk-dev/vitest`) rather
  than writing the file, since many sites test with `bun:test`. Add it only if
  you use Vitest.
- **`knip.json`** — a seed knip config (ignores `@ingram-tech/nk-dev` and the
  `nk` binary; knip has no shareable config). `nk check` runs knip whenever a
  knip config is present.
- **`.githooks/pre-commit`** + a `prepare` script — the oxfmt format-on-commit
  hook (logic lives in nk-dev's `nextkit-format-staged` bin).
- **`CLAUDE.md`** — the `@import` of the shared agent guide.

Everything is `extends`-based, so it's enforced-by-default but overridable: layer
your own rules on top, or swap a tool out by replacing the stub (e.g. delete the
oxlint stub and drop in a `biome.json`).

Sites still on ESLint: delete the ESLint config and deps — oxlint covers the
common rule set out of the box. On Prettier or Biome? Seed `.oxfmtrc.json` with
`oxfmt --migrate=prettier` / `oxfmt --migrate=biome`, then reconcile against the
shared config.

## 2. Email

Replace any local `lib/email.ts` Cloudflare client with `@ingram-tech/email`:

```bash
bun add @ingram-tech/email
```

Then delete the local copy and update imports. Set `CLOUDFLARE_ACCOUNT_ID`,
`CLOUDFLARE_EMAIL_API_TOKEN`, `EMAIL_FROM_DOMAIN` in the environment.

## 3. The `docs/` convention

Create a `docs/` directory and start writing AI-facing developer docs as you
build subsystems. See [`ai-docs-convention.md`](./ai-docs-convention.md).

## 4. CLAUDE.md

Reference nextkit's conventions from the site's `CLAUDE.md` so agents follow the
house rules. Keep the always-loaded part thin; link out to these docs.

## Keeping up to date

Install [Renovate](https://docs.renovatebot.com/) on the repo so
`@ingram-tech/*` bumps arrive as PRs automatically, each with its own Vercel
preview. That is how single-source-of-truth improvements reach the site.

## Per-site adoption status

Track adoption in each consuming repo's `CLAUDE.md` or an issue, not here.
