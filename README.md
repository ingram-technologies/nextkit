# nextkit

Shared foundation for [Ingram Technologies](https://ingram.tech)' Next.js
websites: configuration, libraries, and conventions, as independently versioned
packages.

> **Prime directive:** a nextkit site is indistinguishable from a normal Next.js
> site, beyond its dependencies. nextkit does not wrap or replace Next.js.

## Why

We run many Next.js sites with the same needs (email, newsletters, bot
protection, linting, testing, code style), which were being re-implemented per
site and drifting apart. Each concern now lives in one package that sites
consume by version.

Reasoning in full: [docs/philosophy.md](./docs/philosophy.md).

## Packages

Published as `@ingram-tech/<name>`.

| Package | What |
| --- | --- |
| [`nk-dev`](./packages/nk-dev) | The dev toolchain in one package: the `nk` CLI (`nk dev`/`check`/…, never required), shared oxlint + oxfmt / TypeScript / Vitest config, the format-on-commit hook, the AI agent guide, and `nk init` to scaffold a site |
| [`nk-email`](./packages/nk-email) | Zero-dep Cloudflare email client |
| [`nk-forms`](./packages/nk-forms) | Public contact/signup submission pipeline: bot protection (honeypot + signed timing token + Vercel BotID), `handleFormSubmission`, escaped notification emails, and a headless client hook |
| [`nk-db`](./packages/nk-db) | Postgres data layer: shared `pg` pool, raw-SQL helpers, Drizzle wiring, PGlite (no-Docker) dev/test harness |
| [`nk-auth`](./packages/nk-auth) | Better Auth foundation: composable presets a site spreads into its own `betterAuth()` |
| [`nk-billing`](./packages/nk-billing) | Stripe primitives (client, customers, prices, currency, checkout, subscriptions, webhooks) + Stripe-side wallet + injection-based Postgres credit ledger |
| [`nk-api`](./packages/nk-api) | Typed API toolkit: Hono + zod-openapi router, auth/scope guards, cursor pagination, and a typed client, mounted into a Next.js route |
| [`nk-i18n`](./packages/nk-i18n) | i18n: `intl-messageformat` formatting, Accept-Language negotiation, and React client helpers |
| [`nk-marketing`](./packages/nk-marketing) | Postgres-backed marketing & lifecycle email: contacts + consent, newsletter audiences (broadcast), and idempotent triggered campaigns, with RFC 8058 one-click unsubscribe |
| [`nk-seo`](./packages/nk-seo) | SEO toolkit: metadata factory, JSON-LD builders, sitemap/robots routes, hreflang + canonical links, OG image template |
| [`nk-blog`](./packages/nk-blog) | File-indexed blog engine: frontmatter contract, limited-MDX rendering with a fixed set of allowed components, RSS, blog SEO, GitHub publishing |
| [`nk-themes`](./packages/nk-themes) | Color-mode theming: cookie-backed `<ThemeProvider>` that paints without a flash on SSR, `useTheme`, and a headless `<ThemeToggle>` |

See [docs/](./docs/README.md).

## Stack

Next.js + Bun + Vercel, oxlint + oxfmt + Vitest + Playwright, Cloudflare (email).
When a site needs a database or auth: a shared DigitalOcean Managed Postgres
cluster reached directly via `pg` + Drizzle (`nk-db`), Better Auth (`nk-auth`),
and PGlite for local dev/test, rather than a hosted REST or auth product.
EU-first, self-hostable, no per-seat US SaaS. Stripe (`nk-billing`) is the one
exception.

## Develop

```bash
bun install
bun run ci      # check + build + type-check + test
bun run build   # build all publishable packages
```

This repo uses its own configs. See
[docs/architecture.md](./docs/architecture.md).

## Adopt it in a site

See [docs/adopting-nextkit.md](./docs/adopting-nextkit.md).

## License

[MIT](./LICENSE) © Ingram Technologies
