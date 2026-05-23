# nextkit

A super-thin, opinionated foundation for [Ingram Technologies](https://ingram.tech)'
Next.js websites. Shared configuration, libraries, and conventions — kept in one
place, versioned, and propagated to every site.

> **Prime directive:** a nextkit site is indistinguishable from a normal Next.js
> site, beyond its dependencies. We don't wrap or replace Next.js — we give it
> the right setup from the start and keep it updated centrally.

## Why

We run many Next.js sites (financica, fabrile, sevenseed.eu, sevencapital.vc,
malinamore.studio, malinamore.art, peppost). They share the same needs — email,
newsletters, bot protection, linting, testing, code style — and those kept
getting re-implemented and drifting apart. nextkit makes each concern live once,
as a package sites consume by version. Fix it once, every site benefits.

Read **[docs/philosophy.md](./docs/philosophy.md)** for the full reasoning.

## Packages

| Package | What |
| --- | --- |
| [`@ingram-tech/biome-config`](./packages/biome-config) | Shared Biome lint + format config |
| [`@ingram-tech/typescript-config`](./packages/typescript-config) | Strict TS configs (base + Next.js) |
| [`@ingram-tech/test-config`](./packages/test-config) | Vitest preset + setup |
| [`@ingram-tech/git-hooks`](./packages/git-hooks) | Biome format-on-commit hook |
| [`@ingram-tech/email`](./packages/email) | Zero-dep Cloudflare email client |

More to come (newsletter, bot-protection, blog, supabase). See
[docs/](./docs/README.md).

## Stack & stance

Next.js + Bun + Vercel, Biome + Vitest + Playwright, Cloudflare (email) and
Supabase (when a DB is needed). EU-first, self-hostable, no per-seat US SaaS.

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
