# Adopting nextkit in a website

How to migrate an existing Ingram Next.js site (or set up a new one) onto
nextkit. Adopt incrementally — each step is independent and low-risk.

## 1. Shared tooling configs (do this first — highest ROI, lowest risk)

```bash
bun add -d @ingram-tech/oxlint-config @ingram-tech/typescript-config \
	@ingram-tech/test-config @ingram-tech/git-hooks oxlint oxfmt typescript
```

> Already on `@ingram-tech/biome-config`? Run the codemod instead — see
> [`oxlint-migration.md`](./oxlint-migration.md). The steps below are for a
> fresh adoption.

**Lint (oxlint)** — add `.oxlintrc.json`. Note oxlint's `extends` resolves
**relative paths**, not package specifiers:

```json
{
	"$schema": "./node_modules/oxlint/configuration_schema.json",
	"extends": ["./node_modules/@ingram-tech/oxlint-config/oxlintrc.json"],
	"ignorePatterns": ["dist", ".next"]
}
```

**Format (oxfmt)** — oxfmt has no `extends`, so copy the shared config to a
local `.oxfmtrc.json` (the codemod does this for you):

```bash
cp node_modules/@ingram-tech/oxlint-config/oxfmtrc.json .oxfmtrc.json
```

Sites still on ESLint: just delete the ESLint config and deps — oxlint covers
the common rule set out of the box. On Prettier or Biome? Seed your
`.oxfmtrc.json` with `oxfmt --migrate=prettier` / `oxfmt --migrate=biome`, then
reconcile against the shared config.

**TypeScript** — point `tsconfig.json` at the shared preset:

```json
{ "extends": "@ingram-tech/typescript-config/nextjs.json" }
```

**Git hooks** — add `.githooks/pre-commit` (`exec bunx --bun nextkit-format-staged`),
`chmod +x` it, and add the `prepare` script. See
[`git-hooks` README](../packages/git-hooks/README.md).

**Tests** — wire up `vitest.config.ts` via `mergeConfig(nextkitTestConfig, …)`.
See [`test-config` README](../packages/test-config/README.md).

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
