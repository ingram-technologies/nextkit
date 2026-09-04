# nextkit (for AI agents)

This is a **nextkit** site — Ingram Technologies' shared Next.js foundation.
Core idea: don't reinvent shared concerns — reach for the `@ingram-tech/*`
package. Stay a thin, standard Next.js app (bun · oxlint + oxfmt · strict TS).

## Hard rules

- **Public contact/signup forms MUST use `@ingram-tech/nk-forms`** — one
  `createFormsHandler` registry at `app/internal/forms/[form]/route.ts`
  (rate-limit → bot gate → validate → escaped-email deliver → uniform 200)
  and `useFormSubmit(formEndpoint(name))` + `HoneypotInput` client-side.
  Forms are plumbing, not API: never mount one under `/api/…` (see Route & URL
  conventions). For guarding a *non-form* endpoint (a checkout, an authed
  route), call nk-forms' `checkBot` / `verifyHuman` directly instead of the
  pipeline. Never ship a public form without the bot gate.
- **Send email only via `@ingram-tech/nk-email`** — never add another mail client.
- **Never trust an external request body's shape — validate it with Zod, never
  `as`-cast it.** Every `/api` route and webhook handler takes untrusted input;
  an `as` cast is a lie the type-checker can't catch at runtime.
- Format/lint with **oxlint + oxfmt** via `nk` (`@ingram-tech/nk-dev`); don't
  reintroduce ESLint or Prettier (SQL isn't formatted — it's generated). nk-dev
  owns the toolchain: don't re-declare `oxfmt`/`oxlint`/`typescript` or the
  retired `@ingram-tech/{oxlint,typescript}-config` — `nk doctor` flags the drift.
  `nk` is optional convenience that only orchestrates the standard tools — the
  site must stay buildable with plain `next build` / `next dev`.

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
- **`/api/…` — the app's public API contract, and nothing else.** Routes that
  are a *contract*: versioned, documented (OpenAPI via `nk-api`), something an
  external client or a typed frontend client could build on. The test is not
  "does the frontend fetch it" but "would we owe someone a deprecation if it
  changed". A form POST with one React consumer fails that test.
- **`/internal/…` — everything the app owns and nobody may build on.** Provider
  integrations, webhooks, workers, crons, and the site's own forms:
  - **`/internal/forms/<name>`** — public contact/signup forms, served by one
    `createFormsHandler` registry from `@ingram-tech/nk-forms`. GET mints the
    timing token, POST submits. This is the one anonymous, browser-called
    thing under `/internal`: it is gated by the bot layers and the site's rate
    limiter, **not** by the worker secret. Don't add one.
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
if it's a contract someone else could build on, it's **`/api/…`**; if only this
app's own code, a provider, a cron, or a queue calls it, it's **`/internal/…`**.
Never put OAuth callbacks or webhooks in the UI/page tree, and never expose
internal plumbing — forms included — under `/api/`.

## Data & migrations

- **IDs are UUIDv7** — never UUIDv4 / `gen_random_uuid()` / `defaultRandom()` /
  nanoids. UUIDv7 is time-ordered, so it keeps index locality instead of
  fragmenting the B-tree on random inserts, and one uniform id format spans every
  table. On Postgres ≥18 the column default is native `uuidv7()`
  (`uuid("id").primaryKey().default(sql\`uuidv7()\`)`) and Better Auth gets
  `advanced.database.generateId: false` so the DB mints ids; below 18 — and in
  the nk-auth README's canonical example — pass
  `advanced.database.generateId: uuidv7` (JS-minted UUIDv7 from `id758`;
  `@ingram-tech/nk-auth` re-exports it as `uuidGenerateId`) instead. Either way, never Better Auth's default JS
  nanoid. Ids that cross a **public contract** are skinned to `prefix_base58`
  via `id758` / `@ingram-tech/nk-db/id` (`createIdRegistry`) — never expose a raw UUID.
  External ids you don't mint (Stripe `cus_`, OAuth) stay `text`.
- **Application code only ever sees public ids** (`inv_…`); never convert by
  hand. Declare id columns with `idColumn(entity)` from
  `@ingram-tech/nk-db/id/drizzle`: a public id passed to a query is decoded at
  the column, and a row read back is already encoded (typed `Id<"invoice">`).
  In raw SQL and `psql`, the database converts: `where id = id758_decode($1)`,
  `select id758_encode('inv', id)` (functions from `@ingram-tech/nk-db/id/sql`,
  installed in PGlite automatically and in prod by one custom migration). So no
  `ids.x.decode(param)` before a query and no `ids.x.encode(row.id)` after one
  — `nextkit/no-id-codec-in-app-code` flags both; validate input with
  `ids.x.is(param)` instead. Session ids come in the same form from
  `createAuthHelpers(auth, { ids })` (and `backendJwtOptions({ ids })`), and
  `withRls*` decode a public `sub` before it reaches `auth.uid()`. At the
  shell, `bunx id758 decode inv_…`.
- **Migrations don't auto-apply on deploy.** Code ships ahead of the prod schema
  unless someone runs the migration against the target DB — a page that reads a
  newly-added column 500s in prod until then. Apply migrations with
  `@ingram-tech/nk-db`'s drift-aware runner (`@ingram-tech/nk-db/migrate`), which
  surfaces the real Postgres error and pre-flights journal drift. Generate **and
  apply** in the same step; don't leave "run the migration" as a handoff.
- **A migration that moves data asserts how much it moved.** Any backfill /
  seed / copy counts the rows it expects, compares that to the `row_count` it
  got (`get diagnostics`), and `raise exception`s on a mismatch — inside the
  transaction, before commit. A blind move that touches nothing (an RLS mask, a
  wrong `where`) otherwise reports success, and the drop of the source columns
  in the same migration makes it unrecoverable.
- **Never edit a migration that has been applied.** The runner records
  `sha256(file)`, so the bytes are history: editing one drifts every database
  that already ran it, and drizzle never looks at the file again to notice.
  Express the change as a **new** migration. `drizzle/_seal.json` pins the
  hashes and `nk check` fails on a mismatch — if it does, `git checkout` the
  file rather than resealing. After generating a migration, run **`nk
  migrations`** and commit `_seal.json` in the same commit as the `.sql`.
  `nk migrations --reseal` exists only for a deliberate squash, which also
  requires reconciling every database with `nk-pg-migrate --baseline`.
- **A clean `db:generate` does not mean the chain matches the database.**
  drizzle diffs `schema.ts` against `meta/*_snapshot.json`, never against the
  `.sql` files, and the snapshot can't model functions, triggers, `DEFERRABLE`
  constraints, grants or roles. Anything regenerated from `schema.ts` drops
  those clauses silently. `nk migrations --ddl` lists which migrations carry
  them; verify against a real database before trusting a regenerated chain.
- **Never hand-append unmodelled DDL to a generated migration.** A generated
  file must stay exactly what `drizzle-kit generate` produced, or the snapshot
  becomes an active lie about a file drizzle believes it owns — and the next
  regenerate re-emits those objects without your clauses. Put functions,
  triggers, `DEFERRABLE`, grants and roles in `drizzle-kit generate --custom`
  migrations instead.
- **Merging two branches that both added migrations? Check the journal.**
  drizzle applies files by `when > max(created_at)`, so a migration whose `when`
  lands below one already applied is skipped silently and forever.
  `nk-pg-migrate` refuses to run in that state (`MigrationOrderError`); fix it
  by raising the stranded entry's `when` in `meta/_journal.json` — never by
  editing the `.sql`, which would break the hash every database recorded.
- **`drizzle-kit` is GENERATE-ONLY — it must never apply schema.** Use it for
  `drizzle-kit generate` (and `generate --custom` for a package-owned/raw SQL
  migration). Applying is always **`nk-pg-migrate`** (the bin from
  `@ingram-tech/nk-db`): `bun run db:migrate`, and check first with
  `db:migrate:status`. Two commands are banned, and `nk doctor` fails on either:
  - **`drizzle-kit push`** applies a diff straight to the live DB with no
    migration file and no journal entry. It is the schema-drift source — it has
    already drifted a production database in this fleet, and where the dev DB is
    shared it rewrites everyone's. To iterate locally, rebuild from migrations
    (the PGlite harness / your `dev:*fresh` script), don't push.
  - **`drizzle-kit migrate`** is opaque: it exits non-zero with no message (even
    on a clean no-op) and hides journal drift.

## Large-scale / structural edits

For a **mechanical change repeated across many files** — rewrite an import,
rename an API, add a prop, reshape a call — don't hand-edit file by file or reach
for `sed`. Use **`nk ast-grep`** (`@ingram-tech/nk-dev`): AST-aware structural
search & rewrite of TS/TSX via the vendored ast-grep. **Before starting such a
refactor, read the skill at
`node_modules/@ingram-tech/nk-dev/skills/ts-codemod.md`** — it covers the
search → preview → apply → `nk format` + `nk type-check` workflow, pattern
syntax, and the syntactic-not-semantic limits (when to step up to a type-aware
tool instead). One-off single-file edits: just edit the file.

## What nextkit provides (reach for these)

- `@ingram-tech/nk-email` — Cloudflare email: `sendEmail`, `fromAddress`
- `@ingram-tech/nk-auth` — Better Auth foundation: presets you spread into your own `betterAuth()` (mounts at `/auth` via `authBasePath`; org / JWT / passkey / pool / client helpers). Don't hand-roll session reads or auth middleware — bind `createAuthHelpers` (`getUser` / `requireUser` / `redirectIfAuthenticated`, from `@ingram-tech/nk-auth/server`) and gate routes with the loop-safe `createAuthMiddleware`. A site with its own proxy sets the `next`-preserving header with `withAuthPathHeader(request, requestHeaders)` instead (and `clearStaleSession` for the stale-cookie handshake); a site wrapping the guards redirects to `await signInTarget()` rather than the bare sign-in path
- `@ingram-tech/nk-db` — Postgres data layer: `createPool` (one TLS-aware pool) + `createQueries` (raw SQL) + `createDb` (Drizzle), the PGlite dev/test harness at `@ingram-tech/nk-db/pglite`, the prefixed-id codec (the standalone `id758` package) at `@ingram-tech/nk-db/id`, and the drift-aware migration runner at `@ingram-tech/nk-db/migrate`
- `@ingram-tech/nk-api` — the standard HTTP API seam (Hono + `@hono/zod-openapi`): one `{ error, details? }` envelope, `createApiApp` / `createRouter`, auth + multi-tenant resource-scope middleware, pagination helpers, and an emitted OpenAPI/Swagger doc. Reach for it instead of hand-rolling route handlers
- `@ingram-tech/nk-billing` — Stripe primitives: subscriptions, a Stripe-side wallet, and an optional Postgres credit ledger behind the `/credits` subpath. Prices resolve at runtime by Stripe `lookup_key` — **never hardcode a price id**, so test and live share one code path
- `@ingram-tech/nk-forms` — the public contact/signup submission pipeline: `createFormsHandler` + `defineForm` (one registry at `/internal/forms/[form]`; each entry runs rate-limit → bot gate → validate → escaped-email deliver → uniform 200), `renderNotificationEmail`, and `useFormSubmit(formEndpoint(name))` / `HoneypotInput` (`/react`); `handleFormSubmission` / `mintFormToken` for a standalone route. It owns the invisible bot-protection layers too (honeypot + signed timing token + Vercel BotID); `verifyHuman` / `checkBot` are exported from the root for non-form endpoints
- `@ingram-tech/nk-i18n` — type-safe, English-as-key i18n: the English source text *is* the key (no `en.json`), ICU MessageFormat, colocated JSON catalogs, plus **locale URL routing** (`defineLocaleRouting` + a fixed URL→account→cookie→`Accept-Language`→country precedence, wired to Next at `/next`). A URL that names a locale must serve it with a 200 — never redirect `?hl=fr` away, or every hreflang annotation on the site points at a URL that doesn't serve the language it claims. See `docs/i18n-routing.md`
- `@ingram-tech/nk-marketing` — Postgres-backed marketing & lifecycle email: contacts + consent, newsletter broadcast audiences, and idempotent triggered campaigns, with RFC 8058 one-click unsubscribe
- `@ingram-tech/nk-seo` — SEO toolkit: metadata factory, JSON-LD builders, sitemap/robots routes, hreflang + canonical links, and an OG image template
- `@ingram-tech/nk-blog` — file-indexed blog engine: frontmatter contract, limited-MDX rendering with a component vocabulary, RSS, blog SEO, GitHub publishing
- `@ingram-tech/nk-dev` — the whole dev toolchain in one devDependency: the `nk` command (`nk dev` boots local PGlite via `@ingram-tech/nk-db` if installed, then Next; plus `nk format` / `lint` / `knip` / `check` / `type-check` / `test` / `build`), the shared oxlint + oxfmt / TypeScript / Vitest config, knip, the oxfmt format-on-commit hook, and this guide. `nk check` runs every fast checker (oxlint, oxfmt, knip) in one gate; `nk doctor --fix` reconciles a site back to the canonical toolchain. `nk init` scaffolds a site to use it all.

For detail on any package, read its README in `node_modules/@ingram-tech/<pkg>/`.
