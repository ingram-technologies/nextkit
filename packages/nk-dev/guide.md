# nextkit (for AI agents)

This is a **nextkit** site — Ingram Technologies' shared Next.js foundation.
Core idea: don't reinvent shared concerns — reach for the `@ingram-tech/*`
package. Stay a thin, standard Next.js app (bun · oxlint + oxfmt · strict TS).

## Hard rules

- **Any form that emails or stores a submission MUST use `@ingram-tech/bot-protection`**
  (server: `verifyHuman` → silently drop bots; client: honeypot + signed token).
  Never ship a form without it.
- **Send email only via `@ingram-tech/nk-email`** — never add another mail client.
- **Never trust an external request body's shape — validate it with Zod, never
  `as`-cast it.** Every `/api` route and webhook handler takes untrusted input;
  an `as` cast is a lie the type-checker can't catch at runtime.
- Format/lint with **oxlint + oxfmt** via `nk` (`@ingram-tech/nk-dev`); don't
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

## Data & migrations

- **IDs are UUIDv7** — never UUIDv4 / `gen_random_uuid()` / `defaultRandom()` /
  nanoids. UUIDv7 is time-ordered, so it keeps index locality instead of
  fragmenting the B-tree on random inserts, and one uniform id format spans every
  table. On Postgres ≥18 the column default is native `uuidv7()`
  (`uuid("id").primaryKey().default(sql\`uuidv7()\`)`) and Better Auth gets
  `advanced.database.generateId: false` so the DB mints ids; below 18 — and in
  the nk-auth README's canonical example — pass
  `advanced.database.generateId: uuidGenerateId` (JS-minted UUIDv7 from
  `@ingram-tech/nk-auth`) instead. Either way, never Better Auth's default JS
  nanoid. Ids that cross a **public contract** are skinned to `prefix_base58`
  via `@ingram-tech/nk-db/id` (`createIdRegistry`) — never expose a raw UUID.
  External ids you don't mint (Stripe `cus_`, OAuth) stay `text`.
- **Migrations don't auto-apply on deploy.** Code ships ahead of the prod schema
  unless someone runs the migration against the target DB — a page that reads a
  newly-added column 500s in prod until then. Apply migrations with
  `@ingram-tech/nk-db`'s drift-aware runner (`@ingram-tech/nk-db/migrate`), which
  surfaces the real Postgres error and pre-flights journal drift. Generate **and
  apply** in the same step; don't leave "run the migration" as a handoff.

## What nextkit provides (reach for these)

- `@ingram-tech/nk-email` — Cloudflare email: `sendEmail`, `fromAddress`
- `@ingram-tech/nk-auth` — Better Auth foundation: presets you spread into your own `betterAuth()` (mounts at `/auth` via `authBasePath`; org / JWT / passkey / pool / client helpers). Don't hand-roll session reads or auth middleware — bind `createAuthHelpers` (`getUser` / `requireUser` / `redirectIfAuthenticated`, from `@ingram-tech/nk-auth/server`) and gate routes with the loop-safe `createAuthMiddleware`
- `@ingram-tech/nk-db` — Postgres data layer: `createPool` (one TLS-aware pool) + `createQueries` (raw SQL) + `createDb` (Drizzle), the PGlite dev/test harness at `@ingram-tech/nk-db/pglite`, the prefixed-id codec at `@ingram-tech/nk-db/id`, and the drift-aware migration runner at `@ingram-tech/nk-db/migrate`
- `@ingram-tech/nk-api` — the standard HTTP API seam (Hono + `@hono/zod-openapi`): one `{ error, details? }` envelope, `createApiApp` / `createRouter`, auth + multi-tenant resource-scope middleware, pagination helpers, and an emitted OpenAPI/Swagger doc. Reach for it instead of hand-rolling route handlers
- `@ingram-tech/nk-billing` — Stripe primitives: subscriptions, a Stripe-side wallet, and an optional Postgres credit ledger behind the `/credits` subpath. Prices resolve at runtime by Stripe `lookup_key` — **never hardcode a price id**, so test and live share one code path
- `@ingram-tech/bot-protection` — invisible form protection (honeypot + timing + Vercel BotID)
- `@ingram-tech/nk-i18n` — type-safe, English-as-key i18n: the English source text *is* the key (no `en.json`), ICU MessageFormat, colocated JSON catalogs; routing is left to the site
- `@ingram-tech/nk-dev` — the whole dev toolchain in one devDependency: the `nk` command (`nk dev` boots local PGlite via `@ingram-tech/nk-db` if installed, then Next; plus `nk format` / `lint` / `knip` / `check` / `type-check` / `build`), the shared oxlint + oxfmt / TypeScript / Vitest config, knip, the oxfmt format-on-commit hook, and this guide. `nk check` runs every fast checker (oxlint, oxfmt, SQL, knip) in one gate. `nk init` scaffolds a site to use it all.

For detail on any package, read its README in `node_modules/@ingram-tech/<pkg>/`.
