# @ingram-tech/nk-auth

Composable [Better Auth](https://better-auth.com) presets for Next.js apps, spread
into your *own* `betterAuth()` call. This is not a `betterAuth()` wrapper: your app
stays plain Better Auth, so plugin type inference survives. Import only what you
need from focused subpaths.

`better-auth`, `pg`, `@better-auth/passkey` are peer dependencies, so there is
exactly one Better Auth copy in the app.

| Export (subpath) | For |
| --- | --- |
| `authEnv`, `authSecret`, `isConfigured` (`./`) | env validation — `authEnv()` returns the full `{ secret, baseURL, databaseUrl }` bundle; `authSecret()` resolves just the secret (with the prod/dev rule) for apps that derive their own `baseURL` / DB connection |
| `backendJwtOptions` / `verifyBackendJwt` (`./jwt`) | a JWT for your own backend API (custom `audience`; `ids` mints `sub` as the public user id) |
| `nkOrganizationDefaults`, `lastActiveOrganizationHooks`, `lastActiveOrganizationUserField` (`./organization`) | org-plugin defaults + active-org restore/persist |
| `createAuthPool` (`./pool`) | **deprecated** — alias of `createPool` from [`@ingram-tech/nk-db`](../nk-db); inject your app's shared pool instead |
| `makeEmailSenders`, `makePasskeyOptions`, `passkeyOptionsForBaseUrl`, `uuidGenerateId` (`./`) | email hooks, passkeys (`passkeyOptionsForBaseUrl` derives `rpID`/`origin` from a single base URL), UUID ids |
| `bcryptPassword` (`./`) | **legacy only** — bcrypt verifier for apps with pre-existing bcrypt hashes. New apps omit it (Better Auth defaults to scrypt). See [Migrating bcrypt passwords to scrypt](#migrating-bcrypt-passwords-to-scrypt) |
| `createAuthHelpers`, `safeNext` (`./server`) | validated App Router session helpers (`getSession` / `getUser` / `requireSession` / `requireUser` / `redirectIfAuthenticated`), request-memoized via React `cache()`, with automatic `next` + stale-cookie signalling; `safeNext` validates a `?next=` param |
| `createAuthMiddleware` (`./middleware`) | loop-safe edge middleware: gates unauthenticated users off protected paths, preserves `next`, and clears a stale session cookie so a bad session self-heals |

> **Data access + RLS** is owned by [`@ingram-tech/nk-db`](../nk-db); see §3.
>
> **Backend-JWT + org sites** (a backend API plus the org plugin): compose your
> app's shared nk-db pool, `backendJwtOptions({ audience })`,
> `nkOrganizationDefaults`, and `lastActiveOrganizationHooks(pool)` in your
> `betterAuth()`; verify backend tokens with `verifyBackendJwt`. Keep
> app-specific bits (SSO restrictions, permissions/roles, connectors) in the app.

## Install

```bash
bun add @ingram-tech/nk-auth better-auth @better-auth/passkey pg bcrypt
```

Set the env contract (validated by `keys.ts`):

```dotenv
BETTER_AUTH_SECRET=…            # openssl rand -hex 32
BETTER_AUTH_URL=https://example.com
DATABASE_URL=…                  # direct Postgres connection (:5432)
```

Outside production, `BETTER_AUTH_SECRET` falls back to a well-known insecure
placeholder, so local dev and tests run without setting it (a warning is logged).
In production it stays required — a missing secret throws at startup.

If your app derives its own `baseURL` and opens its own database connection, it
may not want `authEnv()`'s all-or-nothing bundle (which also requires
`BETTER_AUTH_URL` and `DATABASE_URL`). Take just the secret — same prod/dev rule —
with `authSecret()`:

```ts
import { authSecret } from "@ingram-tech/nk-auth";

export const auth = betterAuth({
	database: myOwnDirectPool,
	secret: authSecret(), // required in prod, dev placeholder otherwise — owned here
	baseURL: myOwnBaseUrl,
	// ...
});
```

Do this instead of re-implementing the prod-required / dev-placeholder rule in
the app: the security-sensitive default then lives in exactly one place.

## 1. Apply the schema

nk-auth **owns its auth tables as its own migration chain** — the versioned SQL
files it ships in `migrations/`, journaled separately from your app's `drizzle/`
migrations. You don't copy anything in; you point the runner at the shipped
folder. It creates Better Auth's tables (`user`, `session`, `account`,
`verification`, `jwks`, `passkey`), defaults new user ids to UUIDs, and puts
**deny-all RLS** on all of them (Better Auth reaches them through its own
privileged connection). See [db-package.md § "The nk-auth migration
chain"](../../docs/db-package.md#the-nk-auth-migration-chain) for the full model.

The auth chain runs **before** your app chain, because your app tables FK to
`user`.

**Production / deploy** — add the auth chain to your `db:migrate` script,
auth-first, on its own journal table:

```jsonc
// package.json
"scripts": {
  "db:migrate": "nk-pg-migrate --migrations node_modules/@ingram-tech/nk-auth/migrations --table __nkauth_migrations && nk-pg-migrate"
}
```

The first invocation applies (and journals) nk-auth's chain; the second applies
your app's `drizzle/` chain. Both are idempotent and drift-checked, so re-running
is a no-op — see the [`nk-pg-migrate` runner](../../docs/db-package.md#migrations).

**Local dev** — nothing to do. `nk dev` resolves nk-auth and applies its chain to
the local PGlite database automatically, before your `drizzle/` migrations.

**Tests** — when a test needs the auth tables, pass the shipped folder to
`createTestDb` as a dependency chain (applied first, own journal table):

```ts
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const authMigrations = join(
	dirname(createRequire(import.meta.url).resolve("@ingram-tech/nk-auth/package.json")),
	"migrations",
);

const db = await createTestDb({
	dependencyMigrations: [{ folder: authMigrations, table: "__nkauth_migrations" }],
});
```

**Upgrading better-auth** never means hand-writing a migration in your app: a
schema-changing upgrade ships as a new file in nk-auth's chain, so you bump the
dependency and your next migrate applies it. Reconcile the shipped schema against
a pinned `better-auth` with `npx @better-auth/cli generate` (a maintainer task,
done once in this package).

> **Adopting from the old copy-in model?** Earlier versions told you to `cp` the
> baseline into your own `drizzle/` chain. If you already did, keep that file
> (deleting an applied migration causes journal drift) and just add the auth-chain
> invocation above: its DDL is all `… if not exists`, so it no-ops against your
> existing tables and simply records the nk-auth journal. New auth migrations then
> flow through the shipped chain from here on.

## 2. Configure the server

Your app calls `betterAuth` itself and spreads in the presets, which keeps full
Better Auth type inference at the call site, so `auth.api.*` stays typed.

```ts
// lib/auth.ts
import { passkey } from "@better-auth/passkey";
import { fromAddress, sendEmail } from "@ingram-tech/nk-email";
import {
	authBasePath,
	authEnv,
	makeEmailSenders,
	passkeyOptionsForBaseUrl,
	uuidGenerateId,
} from "@ingram-tech/nk-auth";
import { betterAuth } from "better-auth";
import { pool } from "@/lib/db"; // the ONE shared createPool() from @ingram-tech/nk-db

const env = authEnv();
// Render a real template per `kind` — these are the first mails a user ever
// gets from you. `text: url, html: url` ships a bare link that reads as
// phishing; see "Auth emails" below.
const email = makeEmailSenders(async ({ kind, to, url, user, newEmail }) => {
	const { subject, html, text } = await renderAuthEmail({ kind, url, user, newEmail });
	sendEmail({ to, from: fromAddress("Example"), subject, html, text });
});

export const auth = betterAuth({
	database: pool, // inject the shared pool — exactly one pool per process
	secret: env.secret,
	baseURL: env.baseURL,
	basePath: authBasePath, // mount at /auth, not the framework default /api/auth
	advanced: { database: { generateId: uuidGenerateId } }, // UUIDv7 ids
	// ^ stored as hyphenated UUIDv7 (uuid columns / RLS policies stay valid).
	// To show those same ids as prefixed base58 on the wire/UI — `team_…`, the
	// way an API exposes prefixed ids like `agt_`/`smt_` — skin them with
	// `toPrefixedId(uuid, "team")` / recover with `fromPrefixedId`. `base58Id`
	// mints a fresh one directly for text-id apps. All from `@ingram-tech/nk-auth`.
	emailAndPassword: {
		enabled: true,
		// Better Auth hashes with scrypt by default. Only apps carrying
		// pre-existing bcrypt hashes set `password: bcryptPassword` (legacy).
		sendResetPassword: email.sendResetPassword,
	},
	emailVerification: { sendVerificationEmail: email.sendVerificationEmail },
	user: {
		// Confirms the move from the CURRENT address. Note the name: it is
		// `sendChangeEmailConfirmation`, and betterAuth() does not
		// excess-property-check, so a wrong name here silently never fires.
		changeEmail: {
			enabled: true,
			sendChangeEmailConfirmation: email.sendChangeEmailConfirmation,
		},
	},
	socialProviders: {
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID ?? "",
			clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
		},
	},
	plugins: [
		// Single sign-in origin: derive rpID (host) + origin from the base URL.
		// For multi-origin / parent-domain sites use makePasskeyOptions({ rpId,
		// rpName, origin }) and pass the registrable domain explicitly.
		passkey(passkeyOptionsForBaseUrl(env.baseURL, "Example")),
	],
});
```

```ts
// app/auth/[...all]/route.ts — a standard Next.js route handler.
// Lives at /auth (set via `basePath: authBasePath`), NOT /api/auth: auth is a
// user-facing surface (sign-in, OAuth callbacks), not an internal machine API.
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
export const { GET, POST } = toNextJsHandler(auth);
```

## Auth emails

`makeEmailSenders(send)` returns the three callbacks Better Auth needs. Every
message reaches your `send` with a **`kind`** discriminator — switch on that to
pick a template. Never switch on `subject`: it is default English copy that a
localized site is expected to throw away.

| `kind`           | Better Auth option                            | Goes to               |
| ---------------- | --------------------------------------------- | --------------------- |
| `verify-email`   | `emailVerification.sendVerificationEmail`      | the new signup        |
| `reset-password` | `emailAndPassword.sendResetPassword`           | the account address   |
| `change-email`   | `user.changeEmail.sendChangeEmailConfirmation` | the **current** address |

Each message also carries `user` (`id` for a locale/preferences lookup, `name`
to personalize), `token`, and the originating `request` — whose `Accept-Language`
is the only locale signal available for a signup verification, before the user
has any stored preference.

**Render a real template.** Verification, reset and change-email are the first
mail a user ever gets from you; a bare `<a href=url>url</a>` reads as phishing
and trains people to distrust your domain. Take the
[`registry`](https://github.com/ingram-technologies/registry) email components
(`shadcn add email-verification email-password-reset`), which accept `heading` /
`body` / `ctaLabel` / `preview` overrides so you can pass translated copy, or
write your own. Send auth links from the default `notifications` local part
(`fromAddress("Example")`), **not** `no-reply`: this is the mail users are most
likely to reply to, and dropping that reply is hostile. See
[transactional-email.md](../../docs/transactional-email.md).

**Spread all three in; do not hand-write them.** `betterAuth()` takes its
options through a generic, which switches **off** excess-property checking on
that object literal. A callback under a wrong-but-plausible name compiles
perfectly and then never fires:

```ts
user: {
	changeEmail: {
		enabled: true,
		// WRONG NAME. No type error — and no email, ever. The real option is
		// `sendChangeEmailConfirmation`.
		sendChangeEmailVerification: async ({ user, url }) => { /* dead code */ },
	},
},
```

That is not hypothetical — it shipped, and the failure is silent in both
directions: Better Auth falls through to sending the *verification* mail to the
**new** address instead, so the current address is never told its account is
moving. `makeEmailSenders` exists to keep you off that path; `options.ts` pins
all three names to the real Better Auth option types, so an upstream rename
fails nk-auth's build rather than quietly disabling your mail.

## 3. Query data with RLS intact

Data access lives in [`@ingram-tech/nk-db`](../nk-db), not here. Query over the
direct `pg` connection and wrap reads/writes in `withRls` / `withRlsTransaction`,
which set `request.jwt.claims` + `SET LOCAL ROLE` per transaction from the Better
Auth session — so `auth.uid()` policies fire unchanged, with no JWT minting and
no REST proxy. See its README for the pattern. Pass `user.id` as it comes from
the helpers: a public `usr_…` is decoded to the uuid before it reaches the
claims GUC, so a policy's `auth.uid()` still compares to a `uuid` column.

## 4. Client

Assemble the client in a `"use client"` module (plugin inference is preserved
here too):

```tsx
"use client";
import {
	authBasePath,
	createAuthClient,
	jwtClient,
	passkeyClient,
} from "@ingram-tech/nk-auth/client";

export const authClient = createAuthClient({
	baseURL: process.env.NEXT_PUBLIC_SITE_URL ?? "",
	basePath: authBasePath, // matches the server: /auth
	plugins: [jwtClient(), passkeyClient()],
});
// authClient.signIn.email(...), signIn.social(...), useSession(), passkey.*
```

## 5. Gate routes (without the redirect loop)

Two layers, **one rule that keeps them from fighting**: only the *validated*
layer may redirect a request *away from* the sign-in page.

The validated layer (server helpers) — bind once to your instance:

```ts
// lib/auth/session.ts
import { createAuthHelpers } from "@ingram-tech/nk-auth/server";
import { auth } from "@/lib/auth";

export const {
	getSession,
	getUser,
	requireSession,
	requireUser,
	redirectIfAuthenticated,
	getLinkedProviders, // providerIds linked to the current user
	hasCredentialAccount, // does the current user have an email/password login?
} = createAuthHelpers(auth, {
	// Session ids in public form (`usr_…`, `org_…`), the same form `idColumn`
	// reads return, so `row.organization_id === session.activeOrganizationId`
	// holds. Omit on a site with no public id form.
	ids: { user: ids.user, organization: ids.organization },
});
```

With `ids`, every read through the helpers presents `user.id`,
`session.userId` and `session.activeOrganizationId` as public ids; Better Auth
itself keeps working on raw uuids underneath, and anything read directly from
`auth.api.*` is raw — the same rule as raw SQL vs `idColumn`. Pass the same
helper to `backendJwtOptions({ audience, ids: { user } })` and the backend
JWT's `sub` (and payload `id`) is the public id too. RLS needs nothing: nk-db's
`withRls*` decode a prefixed `sub` before it reaches `request.jwt.claims`, so
`auth.uid()` policies hold either way.

```tsx
// app/dashboard/page.tsx — gate a protected page (validated, DB-backed).
import { requireUser } from "@/lib/auth/session";
export default async function Dashboard() {
	// -> /login?next=/dashboard when signed out (and ?stale=1 when the cookie is
	// present-but-invalid, so middleware clears it). next/stale are automatic.
	const user = await requireUser();
	return <main>Hi {user.email}</main>;
}

// app/login/page.tsx — gate the sign-in page HERE, never in middleware. Honor
// `next` so sign-in returns the user to where they were headed.
import { redirectIfAuthenticated } from "@/lib/auth/session";
import { safeNext } from "@ingram-tech/nk-auth/server";
import { LoginForm } from "./login-form";
export default async function Login({
	searchParams,
}: {
	searchParams: Promise<{ next?: string }>;
}) {
	const next = safeNext((await searchParams).next) ?? "/dashboard";
	await redirectIfAuthenticated(next); // validated: a stale cookie resolves to
	return <LoginForm next={next} />; // "signed out" and falls through to the form
}
```

The optimistic layer (middleware) is a fast edge short-circuit on cookie
*presence*. It can save a render for users with no cookie at all — but it must
never decide the sign-in page, because a present-but-invalid cookie there is
exactly what loops. `createAuthMiddleware` enforces that **at construction**: it
throws if you try to protect or front-door the sign-in path.

```ts
// middleware.ts
import { createAuthMiddleware } from "@ingram-tech/nk-auth/middleware";

export const middleware = createAuthMiddleware({
	protectedPaths: ["/dashboard", "/memory"], // cookie-less -> signInPath
	signInPath: "/login",
	frontDoorPaths: ["/"], // optional: cookie-bearing "/" -> signedInRedirect
	signedInRedirect: "/dashboard",
});

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg).*)"],
};
```

Why the split: middleware runs before render and can't afford a DB lookup, so it
can only trust the cookie *exists*. The server helpers hit `auth.api.getSession`
and check the session *contents* (once per request — the read is memoized with
React `cache()`). When those disagree (revoked session, rotated
secret, wiped DB) the validated layer wins and parks the user on `/login` — and
because middleware refuses to bounce `/login`, the form renders instead of
ping-ponging.

**Self-heal.** A bad session doesn't strand the user. The guard redirects to
`/login?next=<where they were>&stale=1`; middleware (the only pre-render place
that can touch cookies) deletes the dead Better Auth cookies on the `stale`
marker and bounces to a clean `/login?next=…`; signing in returns them to
`next`. `next` for the cookie-less case is filled in by middleware directly; for
the cookie-present case the guard reads it from the `x-nk-auth-path` header
middleware injects — so the self-heal (next + clearing) needs the middleware.
An app that skips middleware still gets validated gating from the server helpers,
just without automatic `next`/clearing.

## 6. Passwords: change, set, and reset

nk-auth owns the reset **sender** (`makeEmailSenders.sendResetPassword`, §2) and
closes the loop so your app never touches Better Auth's `account` table or
endpoint names directly. Three pieces:

**Detect what login the user has.** A social-only account (Google, …) has no
password credential until it sets one. `hasCredentialAccount()` drives the
"Change password" vs "Set password" choice on a security page; reach for
`getLinkedProviders()` when you need the full list.

```tsx
// app/settings/security/page.tsx (server component)
import { hasCredentialAccount } from "@/lib/auth/session";
export default async function Security() {
	return (await hasCredentialAccount()) ? <ChangePassword /> : <SetPassword />;
}
```

**Set a password without a current one.** A social-only user has no current
password to verify, so the re-auth is an emailed reset link — clicking it proves
account ownership. Trigger it with the standard client call; there is no separate
"set password" endpoint:

```ts
await authClient.requestPasswordReset({
	email,
	redirectTo: "/reset-password", // your token-consumer page (below)
});
```

Better Auth's reset endpoint **creates** the credential when the user has none,
so the same flow both resets a forgotten password and sets a first one. That
guarantee is pinned by `reset-password.test.ts` against a real instance, so a
Better Auth upgrade can't silently break the set-password path.

**Consume the token.** The email link lands on your page with `?token=` (or
`?error=INVALID_TOKEN`). `useResetPassword` is the headless state machine —
invalid-token, submitting, success, and policy validation (length + match) —
against the shared `passwordSchema` bounds. You bring the shell:

```tsx
"use client";
import { useResetPassword } from "@ingram-tech/nk-auth/client";
import { authClient } from "@/lib/auth/client";

export function ResetPasswordForm({ token }: { token: string | null }) {
	const { status, error, submit } = useResetPassword(authClient, { token });
	if (status === "invalid") return <p>This link is invalid or has expired.</p>;
	if (status === "success") return <p>Password set. You can now sign in.</p>;
	// <form onSubmit={() => submit(newPassword, confirm)}>; render `error.code`
	// (stable, for i18n) or `error.message` (English fallback).
}
```

Policy constants live at `@ingram-tech/nk-auth/password` (pure, importable from
both ends): `DEFAULT_MIN_PASSWORD_LENGTH` / `DEFAULT_MAX_PASSWORD_LENGTH`,
`passwordSchema()`, and `validateNewPassword()`. Pass your resolved bounds to
`useResetPassword({ token, minLength, maxLength })` if you override Better Auth's
defaults, so the form and the server never drift.

**`.well-known/change-password`.** Add the [W3C well-known
redirect](https://w3c.github.io/webappsec-change-password-url/) so password
managers deep-link straight to your security page. It's a per-app route target,
so nk-auth documents the convention rather than shipping it — in `next.config`:

```ts
async redirects() {
	return [
		{
			source: "/.well-known/change-password",
			destination: "/settings/security", // your Change/Set password page
			permanent: false,
		},
	];
}
```

## Migrating bcrypt passwords to scrypt

`bcryptPassword` is **legacy support only** (see its `@deprecated` note). It
exists so apps whose `account.password` hashes are bcrypt keep verifying:
that is all nk-auth ships for the bcrypt case.

The path to move fully onto scrypt is a **dual-format verifier**, wired in your
app (nk-auth does not ship it). Better Auth's default hasher is scrypt
(`<salt-hex>:<key-hex>`) and bcrypt hashes are trivially distinguishable (they
start with `$2a$`/`$2b$`/`$2y$`), so override only
`emailAndPassword.password.verify` to branch on `hash.startsWith("$2")` →
bcrypt compare, else Better Auth's scrypt verify. Old hashes keep working; every
new signup, password change, and reset writes scrypt. Better Auth has no
rehash-on-login and no "must reset" gate, so bcrypt hashes only upgrade when the
user resets — or via a sign-in wrapper that persists a re-hash with
`internalAdapter.updatePassword`.
