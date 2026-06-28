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
| [`@ingram-tech/nk-dev`](./packages/nk-dev) | The whole dev toolchain in one package: the `nk` CLI (`nk dev`/`check`/…, never required), shared oxlint + oxfmt / TypeScript / Vitest config, the format-on-commit hook, the AI agent guide, and `nk init` to scaffold a site |
| [`@ingram-tech/nk-email`](./packages/nk-email) | Zero-dep Cloudflare email client |
| [`@ingram-tech/bot-protection`](./packages/bot-protection) | Invisible form bot protection (honeypot + timing + BotID) |
| [`@ingram-tech/nk-db`](./packages/nk-db) | Postgres data layer: shared `pg` pool, raw-SQL helpers, Drizzle wiring, PGlite (no-Docker) dev/test harness |
| [`@ingram-tech/nk-auth`](./packages/nk-auth) | Better Auth foundation: composable presets a site spreads into its own `betterAuth()` |
| [`@ingram-tech/nk-billing`](./packages/nk-billing) | Stripe primitives (client, customers, prices, currency, checkout, subscriptions, webhooks) + Stripe-side wallet + injection-based Postgres credit ledger |
| [`@ingram-tech/nk-api`](./packages/nk-api) | Typed API toolkit: Hono + zod-openapi router, auth/scope guards, cursor pagination, and a typed client — mounts into a Next.js route |
| [`@ingram-tech/nk-i18n`](./packages/nk-i18n) | Lightweight i18n: `intl-messageformat` formatting, Accept-Language negotiation, and React client helpers |
| [`@ingram-tech/nk-marketing`](./packages/nk-marketing) | Postgres-backed marketing & lifecycle email: contacts + consent, newsletter audiences (broadcast), and idempotent triggered campaigns, with RFC 8058 one-click unsubscribe |

More to come (blog). See [docs/](./docs/README.md).

## Stack & stance

Next.js + Bun + Vercel, oxlint + oxfmt + Vitest + Playwright, Cloudflare (email).
When a site needs a database or auth: a shared DigitalOcean Managed Postgres
cluster reached directly via `pg` + Drizzle (`nk-db`), Better Auth (`nk-auth`),
and PGlite for local dev/test — no hosted REST/auth product. EU-first,
self-hostable, no per-seat US SaaS. Payments, when needed, go through Stripe
(`nk-billing`) — the one US-SaaS exception, justified as a payment processor.

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
