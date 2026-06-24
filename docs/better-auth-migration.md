# Migrating from Supabase Auth to Better Auth (without losing RLS)

**Status: complete — historical.** The fleet is fully on Better Auth and has left
Supabase entirely. This doc is kept for the rationale (why Better Auth, the UUID
trap, the table lockdown) and as a record of the cutover, not as a live runbook.

> **The Supabase-specific package surface has been removed** (`@ingram-tech/nk-auth`
> ≥ 0.8.0): the `createServerSupabase` data client, the `rlsJwtOptions` RLS-bridge
> preset, and the `NEXT_PUBLIC_SUPABASE_*` env vars are gone. Data access + RLS now
> live in [`@ingram-tech/nk-db`](./db-package.md) — direct `pg` with
> `withRls` / `withRlsTransaction` (claims from the Better Auth session, no JWT
> minting, no PostgREST). The "RLS bridge" sections below describe that removed
> path and are retained only for context. Read [`philosophy.md`](./philosophy.md)
> (vendor stance + Django-app model) for the durable reasoning.

## Why this is even on the table

Better Auth fits our [vendor stance](./philosophy.md#the-vendor-stance-eu-first-self-hostable-no-per-seat-us-saas)
better than Supabase Auth does:

- **Self-hostable, no per-seat SaaS.** It is an open-source library that runs in
  our own Next.js process and stores everything in our own Postgres. No Clerk,
  no per-MAU pricing.
- **It owns its own tables and migration** — exactly the
  [Django-app model](./philosophy.md#the-django-app-model-for-stateful-packages)
  we already use for stateful packages.
- **It mounts as a standard Next.js route handler.** No build interception, so
  it respects the [prime directive](./philosophy.md#the-prime-directive-stay-indistinguishable-from-plain-nextjs).
- **Passkeys, and email as a plain function.** Better Auth's email hooks are
  just `async` callbacks — we wire them straight to `@ingram-tech/nk-email`
  (Cloudflare Email Sending). No SMTP needed, which matters because Cloudflare
  has no outbound SMTP.

What we keep: **Supabase Postgres, PostgREST, and RLS.** We are replacing the
*auth* product, not the database.

## Is this complicated? Honestly assessed

The complexity is lopsided. The part people fear is the easy part; the parts
nobody mentions are the work.

**Low-risk / already solved (Better Auth ships the script):**

- Migrating `auth.users` + `auth.identities` → `public.user` / `public.account`,
  **preserving the original user UUIDs** (critical — see RLS below).
- **Passwords carry over.** Supabase hashes with bcrypt; we point Better Auth's
  verifier at bcrypt so existing passwords keep working — no forced reset.
- OAuth identities, user metadata, email-verified state.

**The real work (none of it covered by Better Auth's official guide):**

1. **Preserving RLS** — `auth.uid()` stops being populated the moment Supabase
   Auth is gone. This is the centerpiece of this doc.
2. **The UUID trap** — Better Auth generates non-UUID ids for *new* users by
   default, which silently breaks RLS for everyone who signs up after cutover.
3. **All sessions invalidate at cutover** — every user is logged out once.
4. **Better Auth's tables land in `public`** and are exposed by PostgREST — they
   must be locked down or they leak.
5. **Fleet rewrite** — every `supabase.auth.*` call, OAuth redirect URL, and
   email flow on every site changes. This is why we build a package and codemod,
   not N hand-migrations.

Verdict: **tractable, but it is a real project per site.** Do it as a shared
package + a pilot site, then propagate. Do not hand-migrate sites in parallel.

## The hard part: keeping RLS working

Our sites query data through **supabase-js / PostgREST**, and RLS policies are
written against `auth.uid()`. `auth.uid()` is just:

```sql
-- Supabase's built-in, simplified
coalesce(
  nullif(current_setting('request.jwt.claim.sub', true), ''),
  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
)::uuid
```

It reads the **`sub` claim of the JWT** that PostgREST received. So RLS keeps
working as long as every PostgREST request carries a JWT whose `sub` is the
user's UUID and whose `role` is `authenticated`. The job is to make **Better
Auth mint that JWT** and **supabase-js send it**.

### Bridge A — Better Auth JWKS as a Supabase third-party issuer (recommended)

Asymmetric signing, no shared secret, `auth.uid()` works natively.

1. Enable the Better Auth **`jwt` plugin** with an asymmetric algorithm
   (`EdDSA` or `ES256`). It exposes a JWKS endpoint at
   `https://<site>/auth/jwks` and signs session tokens with the private key.
2. Shape the token so Supabase accepts it: `sub` = user id (UUID),
   `role = "authenticated"`, `aud = "authenticated"`.
3. Register that issuer in Supabase **Authentication → Third-Party Auth** (or
   `supabase/config.toml`) by its **JWKS URL**. Supabase now validates the
   `Authorization: Bearer <jwt>` against our JWKS, sets `request.jwt.claims`, and
   `auth.uid()` returns `sub` unchanged.

```ts
// in the auth config (see package design below)
import { jwt } from "better-auth/plugins";

jwt({
	jwks: { keyPairConfig: { alg: "EdDSA" } },
	jwt: {
		definePayload: ({ user }) => ({
			sub: user.id,           // MUST be the Supabase UUID
			role: "authenticated",  // MUST be set or PostgREST treats it as anon
			aud: "authenticated",
		}),
	},
}),
```

Then supabase-js sends it automatically via the v2 `accessToken` callback — no
manual header wiring, and no use of `supabase.auth` at all:

```ts
// the data client (factory in @ingram-tech/nk-auth)
import { createClient } from "@supabase/supabase-js";

createClient(url, anonKey, {
	accessToken: async () => (await auth.api.getToken({ headers })).token,
});
```

**Why A over B:** Supabase is migrating to asymmetric JWT signing keys and
[actively discourages sharing the HS256 secret](https://supabase.com/docs/guides/auth/jwts).
Asymmetric keeps the private key inside our app and survives Supabase's
legacy-secret deprecation.

### Bridge B — shared HS256 secret (stopgap only)

If Supabase's third-party config can't be made to accept our issuer on a given
project, the `jwt` plugin can sign with **`HS256` using Supabase's legacy JWT
secret**. supabase-js validates it because it shares the secret. Same `sub` /
`role` claims apply. Treat as temporary: the legacy secret is on Supabase's
deprecation path, and sharing it widens the blast radius if leaked.

### Do NOT need: rewriting policies

Because we keep `auth.uid()` populated, **existing RLS policies are unchanged** —
whichever bridge you use.

> **Direct-Postgres sites (the common case now): keep RLS without PostgREST.**
> Most sites have left supabase-js/PostgREST for direct `pg` + Drizzle (see
> [`db-package.md`](./db-package.md)), so the bridges above don't apply — there's
> no PostgREST to set `request.jwt.claims`. **You still don't have to rewrite
> policies:** use **`withRlsTransaction` / `withRls` from
> [`@ingram-tech/nk-db`](./db-package.md#row-level-security-on-a-direct-connection-withrls--withrlstransaction)**,
> which set `request.jwt.claims` + `SET LOCAL ROLE` per transaction (claims taken
> straight from the Better Auth session — no JWT minting, no JWKS issuer). The
> same `auth.uid()` policies fire unchanged, and it works identically once the
> data moves to DO. App-layer `where owner_id = …` remains the alternative. (This
> is the `SET LOCAL` GUC path; nk-db owns it so apps don't hand-roll it. Better
> Auth itself still connects directly and privileged — see the table-lockdown
> gotcha.)

## Non-obvious gotchas (the silent killers)

- **New users must get UUID ids.** `auth.uid()` casts `sub` to `uuid`. Migrated
  users keep their Supabase UUIDs, but Better Auth defaults to random string ids
  for new signups — which fail the cast and silently break RLS for them. Force
  UUIDs:
  ```ts
  advanced: { database: { generateId: () => crypto.randomUUID() } },
  ```
- **The `role` claim is mandatory.** Omit it and PostgREST runs every request as
  `anon` — policies that key off `authenticated` deny everything, looking like a
  total data outage.
- **Lock down Better Auth's own tables.** `public.user`, `session`, `account`,
  `verification`, `passkey` are created in `public` and exposed by PostgREST.
  Enable RLS with **no policies (deny-all)** on them. Better Auth reaches them
  through its own privileged `DATABASE_URL` Pool (which bypasses RLS), so this
  denies anon/PostgREST access without breaking auth. See the migration SQL.
- **Better Auth needs a direct Postgres connection, not PostgREST.** Use the
  Supabase **session-mode pooler or direct connection** (port 5432). If you use
  the transaction-mode pooler (6543 / pgbouncer), prepared statements break —
  append `?pgbouncer=true` or prefer session mode.
- **All sessions invalidate at cutover.** Everyone is logged out once. Pick a
  low-traffic window and tell users.
- **OAuth redirect URLs change.** From
  `https://<proj>.supabase.co/auth/v1/callback` to
  `https://<site>/auth/callback/<provider>`. Update Google/GitHub consoles
  *before* cutover.
- **Realtime / Storage RLS** (if any site uses them) rely on the same JWT —
  passing the Better Auth token through covers them too, but verify per site.

## The `@ingram-tech/nk-auth` package design

A new runtime package, vertical slice per
[`creating-a-package.md`](./creating-a-package.md). It owns its env contract,
its tables (migration shipped in the package, applied per-site as Supabase SQL),
and its docs. It takes connections **by injection** and never reaches into a
site's generated Supabase types. (Scaffolded — see `packages/nk-auth/`.)

```
packages/nk-auth/
  package.json            # @ingram-tech/nk-auth, peerDeps: @supabase/supabase-js, react
  README.md
  src/
    index.ts              # server entry: re-exports presets, createServerSupabase, authEnv
    options.ts            # portable Better Auth presets (rlsJwtOptions, bcryptPassword, …)
    supabase.ts           # createServerSupabase(config) -> RLS-aware data client
    client.ts             # re-exports createAuthClient + jwtClient + passkeyClient
    keys.ts               # env contract (zod)
    keys.test.ts
  migrations/
    0001_better_auth.sql  # Better Auth tables + deny-all RLS + UUID ids
  tsconfig.json
  vitest.config.ts
```

> **Why presets, not a `createAuth()` wrapper.** A thin published wrapper around
> `betterAuth()` can't both emit portable `.d.ts` (under Bun's isolated store the
> inferred instance type names an internal zod type) *and* keep Better Auth's
> deep plugin inference across the package boundary. So the site calls
> `betterAuth()` itself and spreads in our presets — which also keeps it plain
> Better Auth (prime directive) and preserves full `auth.api.*` typing at the
> call site (where `declaration` is off).

**Env contract (`keys.ts`)** — declared and validated here, never in a central
file (Zod is fine; this package isn't zero-dep like `email`):

| Var | Purpose |
| --- | --- |
| `BETTER_AUTH_SECRET` | session/CSRF signing (`openssl rand -hex 32`) |
| `BETTER_AUTH_URL` | canonical site origin |
| `DATABASE_URL` | **direct** Postgres connection for Better Auth |
| `NEXT_PUBLIC_SUPABASE_URL` | supabase-js data client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | supabase-js data client |
| `GOOGLE_CLIENT_ID` / `_SECRET` | OAuth (per provider in use) |
| `GITHUB_CLIENT_ID` / `_SECRET` | OAuth (per provider in use) |

**The presets (`options.ts`)** — portable building blocks the site spreads into
its own `betterAuth()` call (see the README for the full `lib/auth.ts`):

```ts
// the two RLS-critical presets:
export const uuidGenerateId = (): string => randomUUID();         // UUID trap
export const rlsJwtOptions: JwtOptions = {                        // the bridge
	jwks: { keyPairConfig: { alg: "EdDSA" } },
	jwt: {
		definePayload: ({ user }) => ({
			sub: user.id,           // the Supabase UUID
			role: "authenticated",  // or PostgREST treats the request as anon
			aud: "authenticated",
		}),
	},
};
// plus: bcryptPassword (verifies migrated hashes), makePasskeyOptions, makeEmailSenders.
```

**`createServerSupabase` (server)** — the RLS-aware data client. The single
chokepoint that makes RLS keep working; sites import it instead of constructing
supabase-js themselves. `getToken` is injected so the package needs no Better
Auth type (the site wires it to its own typed instance):

```ts
export const createServerSupabase = (config: ServerSupabaseConfig) =>
	createClient(config.supabaseUrl, config.supabaseAnonKey, {
		accessToken: async () => (await config.getToken()) ?? "", // "" => anon, RLS still enforced
	});
// site: getToken: async () => (await auth.api.getToken({ headers }))?.token ?? null
```

**`client.ts`** — re-exports `createAuthClient`, `jwtClient`, `passkeyClient`;
the site assembles `createAuthClient({ plugins: [jwtClient(), passkeyClient()] })`
in a `"use client"` module (sign-in/up, passkey registration, `useSession`).

Per the [enforcement ladder](./philosophy.md#enforce-what-you-can-document-what-you-cant):
once this lands, add a **Biome/GritQL rule** banning direct `supabase.auth.*`
usage and direct `createClient` for data (force the factory), so RLS can't be
bypassed by a future agent.

## The database migration (per site, committed as Supabase SQL)

Generate the Better Auth schema, then **review and harden it** before committing
as a Supabase migration so `nk dev` / `supabase db push` applies it like any
other:

```bash
npx @better-auth/cli generate --output supabase/migrations/<ts>_better_auth.sql
```

Then edit that SQL to add the two hardening steps the generator won't:

```sql
-- 1) Deny-all RLS on Better Auth's own tables (exposed via PostgREST).
--    Better Auth uses its privileged DATABASE_URL pool, which bypasses RLS.
alter table "user"         enable row level security;
alter table "session"      enable row level security;
alter table "account"      enable row level security;
alter table "verification" enable row level security;
alter table "passkey"      enable row level security;
-- (no policies = no anon/authenticated access)

-- 2) Default new ids to UUIDs so auth.uid()'s ::uuid cast holds.
alter table "user" alter column "id" set default gen_random_uuid()::text;
```

Existing app-table policies (the ones using `auth.uid()`) are **untouched** —
that's the whole point of the JWT bridge.

## Per-site migration runbook

For each site, in order:

1. **Back up** the Supabase database (full dump). The user-migration script
   mutates production data.
2. **Install** `@ingram-tech/nk-auth` + peers (`pg`, `bcrypt`, `better-auth`,
   `@better-auth/sso` only if SSO is used).
3. **Apply the migration SQL** (creates + hardens Better Auth tables).
4. **Run Better Auth's user-migration script** (from the
   [official guide](https://better-auth.com/docs/guides/supabase-migration-guide))
   to copy `auth.users`/`auth.identities` → `public.user`/`account`, preserving
   UUIDs and bcrypt hashes. `FROM_DATABASE_URL` and `TO_DATABASE_URL` are the
   same Supabase DB.
5. **Wire the routes:** `app/auth/[...all]/route.ts` → `auth.handler` (mount at
   `/auth` via `basePath: authBasePath`, not `/api/auth`).
6. **Configure the RLS bridge** (Bridge A: register the JWKS issuer in Supabase;
   confirm `auth.uid()` returns the right UUID with a probe query).
7. **Swap the data client** to `createServerSupabase` everywhere supabase-js is
   constructed.
8. **Rewrite the auth calls** (codemod, table below).
9. **Update OAuth redirect URLs** in Google/GitHub consoles.
10. **Verify** end-to-end on a Vercel preview: sign-up, sign-in (password +
    OAuth), passkey register/login, password reset email, and — critically — an
    RLS-protected read/write returns exactly the owning user's rows.
11. **Cutover** in a low-traffic window; announce the one-time logout.

### Call-rewrite mapping (the codemod)

Ship this as a GritQL/jscodeshift codemod in the package so each site's rewrite
is mechanical, not hand-done:

| Supabase Auth | Better Auth |
| --- | --- |
| `supabase.auth.signUp` | `authClient.signUp.email` |
| `supabase.auth.signInWithPassword` | `authClient.signIn.email` |
| `supabase.auth.signInWithOAuth` | `authClient.signIn.social` |
| `supabase.auth.signOut` | `authClient.signOut` |
| `supabase.auth.getSession` | `authClient.getSession` / `authClient.useSession` |
| `supabase.auth.getUser` (server) | `auth.api.getSession({ headers })` |
| `createClient(...)` for **data** | `createServerSupabase({ getToken, supabaseUrl, supabaseAnonKey })` |

## Fleet rollout (pilot first)

1. **Build & publish `@ingram-tech/nk-auth`** with a changeset (it's a new
   published package — semver `0.1.0`).
2. **Pilot one low-risk site** end-to-end using the runbook. Treat the pilot as
   the real spec: fold every surprise back into the package, the codemod, and
   this doc — the [positive feedback loop](./philosophy.md#the-positive-feedback-loop).
3. **Propagate** to the rest of the fleet via Renovate PRs, one site at a time,
   each on its own Vercel preview. Never batch cutovers.
4. **Track per-site adoption** in each consuming repo's `CLAUDE.md`, not here
   (matches [`adopting-nextkit.md`](./adopting-nextkit.md)).

## Risks & rollback

- **RLS misconfig = data exposure or total lockout.** Mitigate: the
  `createServerSupabase` chokepoint + the deny-all on Better Auth tables + a
  mandatory RLS probe in step 10 before cutover.
- **Rollback during cutover:** keep Supabase Auth enabled and the `auth` schema
  intact until the pilot is proven. The user-migration is additive (writes to
  `public`, reads from `auth`), so reverting is "point the app back at
  `supabase.auth`" until the old sessions/secrets are removed.
- **Bridge A unavailable on a project:** fall back to Bridge B (HS256) for that
  project, tracked as tech debt.

## Decisions to confirm before building

- **One Supabase project per site, or shared?** Affects how many JWKS issuers we
  register and whether `BETTER_AUTH_URL` / `rpID` are per-site (assumed: yes,
  per-site).
- **Bridge A vs B as the default** — this doc assumes A; confirm Supabase
  third-party JWKS registration is available on our plan.
- **Passkey `rpID` strategy** for sites on multiple domains/subdomains.

## References

- [Better Auth — Supabase migration guide](https://better-auth.com/docs/guides/supabase-migration-guide)
  (users, accounts, passwords, SSO; **does not** cover RLS)
- [Supabase — JWTs](https://supabase.com/docs/guides/auth/jwts) and
  [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Implementing RLS in Supabase with Better Auth](https://funtime.hashnode.dev/implementing-row-level-security-in-supabase-with-better-auth)
  (the JWT-claim bridge technique)
- [`philosophy.md`](./philosophy.md), [`creating-a-package.md`](./creating-a-package.md),
  [`code-style.md`](./code-style.md#data-access-supabase)
