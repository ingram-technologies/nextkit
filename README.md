# nextkit

A super-thin, opinionated foundation for [Ingram Technologies](https://ingram.tech)'
Next.js websites. Shared configuration, libraries, and conventions — kept in one
place, versioned, and propagated to every site.

> **Prime directive:** a nextkit site is indistinguishable from a normal Next.js
> site, beyond its dependencies. We don't wrap or replace Next.js — we give it
> the right setup from the start and keep it updated centrally.

## Why

We run many Next.js sites. They share the same needs — email, newsletters, bot
protection, linting, testing, code style — and those kept getting
re-implemented and drifting apart. nextkit makes each concern live once, as a
package sites consume by version. Fix it once, every site benefits.

Read **[docs/philosophy.md](./docs/philosophy.md)** for the full reasoning.

## Packages

| Package | What |
| --- | --- |
| [`@ingram-tech/oxlint-config`](./packages/oxlint-config) | Shared oxlint + oxfmt lint/format config |
| [`@ingram-tech/typescript-config`](./packages/typescript-config) | Strict TS configs (base + Next.js) |
| [`@ingram-tech/test-config`](./packages/test-config) | Vitest preset + setup |
| [`@ingram-tech/git-hooks`](./packages/git-hooks) | oxfmt format-on-commit hook |
| [`@ingram-tech/email`](./packages/email) | Zero-dep Cloudflare email client |
| [`@ingram-tech/bot-protection`](./packages/bot-protection) | Invisible form bot protection (honeypot + timing + BotID) |
| [`@ingram-tech/nk-db`](./packages/nk-db) | Postgres data layer: shared `pg` pool, raw-SQL helpers, Drizzle wiring, PGlite (no-Docker) dev/test harness |
| [`@ingram-tech/nk-auth`](./packages/nk-auth) | Better Auth foundation: composable presets a site spreads into its own `betterAuth()` |
| [`@ingram-tech/nk-cli`](./packages/nk-cli) | Optional `nk` command that *orchestrates* the standard tools (`nk dev`, `nk check`, …) — never required |
| [`@ingram-tech/newsletter`](./packages/newsletter) | Newsletter subscriptions + sending, RFC 8058 one-click unsubscribe (re-platforming onto nk-db) |
| [`@ingram-tech/agent-guide`](./packages/agent-guide) | Brief nextkit conventions for AI agents, imported into a site's CLAUDE.md |

More to come (blog). See [docs/](./docs/README.md).

## Stack & stance

Next.js + Bun + Vercel, oxlint + oxfmt + Vitest + Playwright, Cloudflare (email).
When a site needs a database or auth: a shared DigitalOcean Managed Postgres
cluster reached directly via `pg` + Drizzle (`nk-db`), Better Auth (`nk-auth`),
and PGlite for local dev/test — no hosted REST/auth product. EU-first,
self-hostable, no per-seat US SaaS.

## Develop

```bash
bun install
bun run ci      # check + type-check + test
bun run build   # build all publishable packages
```

This repo dogfoods its own configs. See
[docs/architecture.md](./docs/architecture.md).

## Adopt it in a site

See [docs/adopting-nextkit.md](./docs/adopting-nextkit.md).

## License

[MIT](./LICENSE) © Ingram Technologies
