# nextkit (for AI agents)

This is a **nextkit** site — Ingram Technologies' shared Next.js foundation.
Core idea: don't reinvent shared concerns — reach for the `@ingram-tech/*`
package. Stay a thin, standard Next.js app (bun · oxlint + oxfmt · strict TS).

## Hard rules

- **Any form that emails or stores a submission MUST use `@ingram-tech/bot-protection`**
  (server: `verifyHuman` → silently drop bots; client: honeypot + signed token).
  Never ship a form without it.
- **Send email only via `@ingram-tech/email`** — never add another mail client.
- Format/lint with **oxlint + oxfmt** via `nk` (`@ingram-tech/nk-cli`); don't
  reintroduce ESLint, nor Prettier for code (`nk` uses Prettier only for SQL,
  which oxfmt can't format). `nk` is optional convenience that only orchestrates
  the standard tools — the site must stay buildable with plain `next build` / `next dev`.

## Route & URL conventions

Keep the URL namespace honest about **who calls each route**:

- **`/auth/…` — sign-in, via `@ingram-tech/nk-auth`.** Better Auth mounts here
  through `basePath: authBasePath` (handler at `app/auth/[...all]/route.ts`,
  client `createAuthClient({ basePath: authBasePath })`) — **not** the framework
  default `/api/auth`. So **login / social OAuth callbacks are
  `<site>/auth/callback/<provider>`** (e.g. Google `…/auth/callback/google`) —
  that's the redirect URI you register with the IdP. Don't confuse it with
  *connector* OAuth (the app acting as a client to a provider), which lives at
  `/internal/connect/<provider>/callback` below.
- **`/api/…` — the app's public API only.** Routes that external clients or your
  own frontend consume *as an API*. Nothing else belongs here.
- **`/internal/…` — all plumbing the public never calls as your API.** This is
  where provider integrations, webhooks, workers and crons live:
  - **`/internal/connect/<provider>/{start,callback}`** — the outbound OAuth /
    app-install handshake. `start` (session-gated) kicks off the redirect to the
    provider; **`callback` is the URL you register with the provider** — it
    finishes the exchange/records the install and redirects the user back into the
    app. e.g. `/internal/connect/slack/callback`, `/internal/connect/github/callback`.
  - **`/internal/webhooks/<provider>`** — inbound provider webhooks (Slack,
    GitHub, Stripe, …). Authenticated by the provider's signature/secret, not a
    session. App-level (one URL per provider); route to the tenant from the
    payload (team id, installation id, …).
  - **`/internal/worker/<name>` · `/internal/cron/<name>`** — queue drains and
    scheduled jobs, gated by a shared worker secret (Vercel Cron / queue calls them).

Rule of thumb: if a human navigates to it, it's a **page** (normal route tree);
if your frontend fetches it as an API, it's **`/api/…`**; if a provider, cron, or
queue calls it, it's **`/internal/…`**. Never put OAuth callbacks or webhooks in
the UI/page tree, and never expose internal plumbing under `/api/`.

## What nextkit provides (reach for these)

- `@ingram-tech/email` — Cloudflare email: `sendEmail`, `fromAddress`
- `@ingram-tech/nk-auth` — Better Auth foundation: presets you spread into your own `betterAuth()` (mounts at `/auth` via `authBasePath`; org / JWT / passkey / pool / client helpers)
- `@ingram-tech/nk-db` — Postgres data layer: `createPool` (one TLS-aware pool) + `createQueries` (raw SQL) + `createDb` (Drizzle), plus a PGlite dev/test harness at `@ingram-tech/nk-db/pglite`
- `@ingram-tech/bot-protection` — invisible form protection (honeypot + timing + Vercel BotID)
- `@ingram-tech/newsletter` — Supabase newsletter: subscribe / send, 1-click unsubscribe
- `@ingram-tech/nk-dev` — the whole dev toolchain in one devDependency: the `nk` command (`nk dev` boots local PGlite via `@ingram-tech/nk-db` if installed, then Next; plus `nk format` / `lint` / `knip` / `check` / `type-check` / `build`), the shared oxlint + oxfmt / TypeScript / Vitest config, knip, the oxfmt format-on-commit hook, and this guide. `nk check` runs every fast checker (oxlint, oxfmt, SQL, knip) in one gate. `nk init` scaffolds a site to use it all.

For detail on any package, read its README in `node_modules/@ingram-tech/<pkg>/`.
