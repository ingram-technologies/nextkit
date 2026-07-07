# @ingram-tech/nk-auth

The Ingram **[Better Auth](https://better-auth.com) foundation**: a toolkit of
composable presets each Ingram Next.js site spreads into its *own*
`betterAuth()` call. It is **not** a `betterAuth()` wrapper — the site stays
plain Better Auth (prime directive), keeping full plugin type inference. Import
only what you need from focused subpaths.

`better-auth`, `pg`, `@better-auth/passkey` are **peer dependencies** so there's
exactly one Better Auth copy in the app.

| Export (subpath) | For |
| --- | --- |
| `backendJwtOptions` / `verifyBackendJwt` (`./jwt`) | a JWT for the site's own backend API (custom `audience`) |
| `nkOrganizationDefaults`, `lastActiveOrganizationHooks`, `lastActiveOrganizationUserField` (`./organization`) | org-plugin defaults + active-org restore/persist |
| `createAuthPool` (`./pool`) | **deprecated** — alias of `createPool` from [`@ingram-tech/nk-db`](../nk-db); inject the site's shared pool instead |
| `makeEmailSenders`, `makePasskeyOptions`, `passkeyOptionsForBaseUrl`, `uuidGenerateId` (`./`) | email hooks, passkeys (`passkeyOptionsForBaseUrl` derives `rpID`/`origin` from a single base URL), UUID ids |
| `bcryptPassword` (`./`) | **legacy only** — bcrypt verifier for sites with pre-existing bcrypt hashes. New sites omit it (Better Auth defaults to scrypt). See [Migrating bcrypt passwords to scrypt](#migrating-bcrypt-passwords-to-scrypt) |
| `createAuthHelpers`, `safeNext` (`./server`) | validated App Router session helpers (`getSession` / `getUser` / `requireSession` / `requireUser` / `redirectIfAuthenticated`) with automatic `next` + stale-cookie signalling; `safeNext` validates a `?next=` param |
| `createAuthMiddleware` (`./middleware`) | loop-safe edge middleware: gates unauthenticated users off protected paths, preserves `next`, and clears a stale session cookie so a bad session self-heals |

> **Data access + RLS** is owned by [`@ingram-tech/nk-db`](../nk-db): query over a
> direct `pg` connection and enforce per-request Row Level Security with
> `withRls` / `withRlsTransaction` (claims taken from the Better Auth session — no
> JWT minting, no REST proxy).
>
> **Backend-JWT + org sites** (a backend API plus the org plugin): compose the
> site's shared nk-db pool, `backendJwtOptions({ audience })`,
> `nkOrganizationDefaults`, and `lastActiveOrganizationHooks(pool)` in your
> `betterAuth()`; verify backend tokens with `verifyBackendJwt`. Keep
> app-specific bits (SSO restrictions, permissions/roles, connectors) in the app.
>
> **Note:** pin `kysely@0.28.x` in the consuming app (0.29 moved
> `DEFAULT_MIGRATION_TABLE` out of its barrel, breaking the adapter + the
> Turbopack build).

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

## 1. Apply the schema

```bash
cp node_modules/@ingram-tech/nk-auth/migrations/0001_better_auth.sql \
   migrations/$(date +%Y%m%d%H%M%S)_better_auth.sql
```

It creates Better Auth's tables (`user`, `session`, `account`, `verification`,
`jwks`, `passkey`), defaults new user ids to UUIDs, and puts **deny-all RLS** on
all of them (Better Auth reaches them through its own privileged connection).
Reconcile against your pinned `better-auth` with `npx @better-auth/cli generate`
after upgrades.

## 2. Configure the server

This package is **not** a `betterAuth()` wrapper — your site calls `betterAuth`
itself and spreads in our presets. That keeps full Better Auth type inference at
the call site (so `auth.api.*` stays typed) and keeps the site plain Better Auth,
per the prime directive.

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
const email = makeEmailSenders(({ to, subject, url }) =>
	sendEmail({ to, from: fromAddress(), subject, text: url, html: url }),
);

export const auth = betterAuth({
	database: pool, // inject the shared pool — exactly one pool per process
	secret: env.secret,
	baseURL: env.baseURL,
	basePath: authBasePath, // mount at /auth, not the framework default /api/auth
	advanced: { database: { generateId: uuidGenerateId } }, // UUIDv7 ids
	// ^ stored as hyphenated UUIDv7 (uuid columns / RLS policies stay valid).
	// To show those same ids as prefixed base58 on the wire/UI — `team_…`,
	// matching the Ingram Cloud API's `agt_`/`smt_` ids — skin them with
	// `toPrefixedId(uuid, "team")` / recover with `fromPrefixedId`. `base58Id`
	// mints a fresh one directly for text-id sites. All from `@ingram-tech/nk-auth`.
	emailAndPassword: {
		enabled: true,
		// Better Auth hashes with scrypt by default. Only sites carrying
		// pre-existing bcrypt hashes set `password: bcryptPassword` (legacy).
		sendResetPassword: email.sendResetPassword,
	},
	emailVerification: { sendVerificationEmail: email.sendVerificationEmail },
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

## 3. Query data with RLS intact

Data access lives in [`@ingram-tech/nk-db`](../nk-db), not here. Query over the
direct `pg` connection and wrap reads/writes in `withRls` / `withRlsTransaction`,
which set `request.jwt.claims` + `SET LOCAL ROLE` per transaction from the Better
Auth session — so `auth.uid()` policies fire unchanged, with no JWT minting and
no REST proxy. See its README for the pattern.

## 4. Client

Assemble the client in a `"use client"` module (full plugin inference is
preserved here too):

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
} = createAuthHelpers(auth);
```

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
and check the session *contents*. When those disagree (revoked session, rotated
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
Sites that skip middleware still get validated gating from the server helpers,
just without automatic `next`/clearing.

## 6. Passwords: change, set, and reset

nk-auth owns the reset **sender** (`makeEmailSenders.sendResetPassword`, §2) and
now closes the loop so a site never touches Better Auth's `account` table or
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
exists so sites whose `account.password` hashes are bcrypt keep verifying.
Better Auth's default hasher is **scrypt** (`<salt-hex>:<key-hex>`), and bcrypt
hashes are trivially distinguishable (they start with `$2a$`/`$2b$`/`$2y$`), so
the migration path is a **dual-format verifier**: override only
`emailAndPassword.password.verify` to branch on `hash.startsWith("$2")` →
bcrypt compare, else Better Auth's scrypt verify. Old hashes keep working;
every new signup, password change, and reset writes scrypt. (Better Auth has no
rehash-on-login and no "must reset" gate, so bcrypt hashes only upgrade when
the user resets — or via a sign-in wrapper that persists a re-hash with
`internalAdapter.updatePassword`.)
**Status: proposed** — not yet shipped; `bcryptPassword` remains the stopgap.
