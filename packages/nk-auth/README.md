# @ingram-tech/nk-auth

The Ingram **[Better Auth](https://better-auth.com) foundation**: a toolkit of
composable presets each Ingram Next.js site spreads into its *own*
`betterAuth()` call. It is **not** a `betterAuth()` wrapper — the site stays
plain Better Auth (prime directive), keeping full plugin type inference. Import
only what you need from focused subpaths.

`better-auth`, `pg`, `@better-auth/passkey`, `@supabase/supabase-js` are
**peer dependencies** so there's exactly one Better Auth copy in the app.

| Export (subpath) | For |
| --- | --- |
| `rlsJwtOptions` (`./jwt`) | Supabase RLS bridge token (`role:"authenticated"`) |
| `backendJwtOptions` / `verifyBackendJwt` (`./jwt`) | a JWT for the site's own backend API (custom `audience`) |
| `nkOrganizationDefaults`, `lastActiveOrganizationHooks`, `lastActiveOrganizationUserField` (`./organization`) | org-plugin defaults + active-org restore/persist |
| `createAuthPool` (`./pool`) | `pg` Pool with optional SSL CA verification |
| `bcryptPassword`, `makeEmailSenders`, `makePasskeyOptions`, `uuidGenerateId` (`./`) | password migration, email hooks, passkeys, UUID ids |
| `createServerSupabase` (`./`) | RLS-aware supabase-js client (attaches the session JWT) |

> **Supabase Auth → Better Auth + RLS migration?** Read
> [`docs/better-auth-migration.md`](../../docs/better-auth-migration.md) — the
> RLS bridge, the migration runbook, and the gotchas.
>
> **Backend-JWT + org sites** (a backend API plus the org plugin): compose `createAuthPool`,
> `backendJwtOptions({ audience })`, `nkOrganizationDefaults`, and
> `lastActiveOrganizationHooks(pool)` in your `betterAuth()`; verify backend
> tokens with `verifyBackendJwt`. Keep app-specific bits (SSO restrictions,
> permissions/roles, connectors) in the app.
>
> **Note:** pin `kysely@0.28.x` in the consuming app (0.29 moved
> `DEFAULT_MIGRATION_TABLE` out of its barrel, breaking the adapter + the
> Turbopack build).

## Install

```bash
bun add @ingram-tech/nk-auth @supabase/supabase-js better-auth @better-auth/passkey pg bcrypt
```

Set the env contract (validated by `keys.ts`):

```dotenv
BETTER_AUTH_SECRET=…            # openssl rand -hex 32
BETTER_AUTH_URL=https://example.com
DATABASE_URL=…                  # DIRECT Postgres (session pooler / :5432), NOT PostgREST
NEXT_PUBLIC_SUPABASE_URL=…
NEXT_PUBLIC_SUPABASE_ANON_KEY=…
```

## 1. Apply the schema

```bash
cp node_modules/@ingram-tech/nk-auth/migrations/0001_better_auth.sql \
   supabase/migrations/$(date +%Y%m%d%H%M%S)_better_auth.sql
```

It creates Better Auth's tables (`user`, `session`, `account`, `verification`,
`jwks`, `passkey`), defaults new user ids to UUIDs, and puts **deny-all RLS** on
all of them (they're exposed via PostgREST; Better Auth uses its own privileged
connection). Reconcile against your pinned `better-auth` with
`npx @better-auth/cli generate` after upgrades.

## 2. Configure the server

This package is **not** a `betterAuth()` wrapper — your site calls `betterAuth`
itself and spreads in our presets. That keeps full Better Auth type inference at
the call site (so `auth.api.*` stays typed) and keeps the site plain Better Auth,
per the prime directive. The presets carry the RLS-preserving bits.

```ts
// lib/auth.ts
import { passkey } from "@better-auth/passkey";
import { fromAddress, sendEmail } from "@ingram-tech/email";
import {
	authBasePath,
	authEnv,
	bcryptPassword,
	makeEmailSenders,
	makePasskeyOptions,
	rlsJwtOptions,
	uuidGenerateId,
} from "@ingram-tech/nk-auth";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins/jwt";
import { Pool } from "pg";

const env = authEnv();
const email = makeEmailSenders(({ to, subject, url }) =>
	sendEmail({ to, from: fromAddress(), subject, text: url, html: url }),
);

export const auth = betterAuth({
	database: new Pool({ connectionString: env.databaseUrl }),
	secret: env.secret,
	baseURL: env.baseURL,
	basePath: authBasePath, // mount at /auth, not the framework default /api/auth
	advanced: { database: { generateId: uuidGenerateId } }, // UUIDv7 ids
	// ^ stored as hyphenated UUIDv7 (uuid columns / Supabase RLS stay valid).
	// To show those same ids as prefixed base58 on the wire/UI — `team_…`,
	// matching the Ingram Cloud API's `agt_`/`smt_` ids — skin them with
	// `toPrefixedId(uuid, "team")` / recover with `fromPrefixedId`. `base58Id`
	// mints a fresh one directly for text-id sites. All from `@ingram-tech/nk-auth`.
	emailAndPassword: {
		enabled: true,
		password: bcryptPassword, // verifies migrated Supabase bcrypt hashes
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
		jwt(rlsJwtOptions), // the RLS bridge
		passkey(makePasskeyOptions({ rpId: "example.com", rpName: "Example", origin: env.baseURL })),
	],
});
```

```ts
// app/auth/[...all]/route.ts — a standard Next.js route handler.
// Lives at /auth (set via `basePath: authBasePath`), NOT /api/auth: auth is a
// user-facing surface (sign-in, OAuth callbacks), not an internal machine API.
import { auth } from "@/lib/auth";
export const { GET, POST } = auth.handler;
```

## 3. Query data with RLS intact

Always go through `createServerSupabase` instead of constructing supabase-js
yourself — it attaches the Better Auth JWT so `auth.uid()` keeps working. Wire
`getToken` to your instance's jwt endpoint (fully typed because *your* site owns
the `betterAuth` call):

```ts
import { authEnv, createServerSupabase } from "@ingram-tech/nk-auth";
import { auth } from "@/lib/auth";

export async function GET(request: Request) {
	const env = authEnv();
	const supabase = createServerSupabase({
		getToken: async () =>
			(await auth.api.getToken({ headers: request.headers }))?.token ?? null,
		supabaseUrl: env.supabaseUrl,
		supabaseAnonKey: env.supabaseAnonKey,
	});
	// Reads/writes run as the signed-in user; existing RLS policies apply.
	const { data, error } = await supabase.from("notes").select("*");
	if (error) throw new Error(error.message);
	return Response.json(data);
}
```

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

## RLS bridge (the important part)

`auth.uid()` reads the `sub` claim of the JWT PostgREST receives. The `jwt`
plugin (configured here) mints an asymmetric token with `sub` = the user's UUID
and `role: "authenticated"`, exposed at `/auth/jwks`. Register that JWKS URL
as a Supabase **third-party auth** issuer, and every existing policy works
unchanged. Full rationale and the HS256 fallback:
[`docs/better-auth-migration.md`](../../docs/better-auth-migration.md).
