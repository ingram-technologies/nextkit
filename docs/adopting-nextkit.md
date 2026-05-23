# Adopting nextkit in a website

How to migrate an existing Ingram Next.js site (or set up a new one) onto
nextkit. Adopt incrementally — each step is independent and low-risk.

## 1. Shared tooling configs (do this first — highest ROI, lowest risk)

```bash
bun add -d @ingram-tech/biome-config @ingram-tech/typescript-config \
	@ingram-tech/test-config @ingram-tech/git-hooks @biomejs/biome typescript
```

**Biome** — replace your `biome.json` with:

```json
{
	"$schema": "https://biomejs.dev/schemas/2.4.15/schema.json",
	"extends": ["@ingram-tech/biome-config/biome.json"],
	"files": { "includes": ["src/**", "*.{ts,js,json}"], "ignoreUnknown": true }
}
```

Sites still on ESLint: migrate to Biome now (`bunx @biomejs/biome migrate eslint`),
then delete the ESLint config and deps. Roll out new rules as `warn` first.

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

Target sites: our reference codebase (reference), a sister site, a sister site, a sister site,
a sister site, a sister site, a sister site. Track adoption in each repo's
`CLAUDE.md` or an issue, not here.
