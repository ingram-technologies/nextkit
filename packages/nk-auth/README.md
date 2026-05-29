# @ingram-tech/nk-auth

[Better Auth](https://better-auth.com) for Ingram Next.js sites, configured so
that **Supabase Postgres + Row Level Security keep working** after you drop
Supabase Auth. Email/password (bcrypt-compatible with migrated Supabase hashes),
OAuth, and passkeys out of the box.

This package **owns its tables** and ships the migration; you inject the
connection, providers, and an email sender. It defines its own config types and
never imports your generated Supabase `Database`, so it drops into any project
(the Django-app model — see [`docs/philosophy.md`](../../docs/philosophy.md)).

> Read [`docs/better-auth-migration.md`](../../docs/better-auth-migration.md)
> first — it explains the RLS bridge, the migration runbook, and the gotchas
> this package exists to handle.

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
	advanced: { database: { generateId: uuidGenerateId } }, // UUID-shaped ids
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
// app/api/auth/[...all]/route.ts — a standard Next.js route handler
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
	createAuthClient,
	jwtClient,
	passkeyClient,
} from "@ingram-tech/nk-auth/client";

export const authClient = createAuthClient({
	baseURL: process.env.NEXT_PUBLIC_SITE_URL ?? "",
	plugins: [jwtClient(), passkeyClient()],
});
// authClient.signIn.email(...), signIn.social(...), useSession(), passkey.*
```

## RLS bridge (the important part)

`auth.uid()` reads the `sub` claim of the JWT PostgREST receives. The `jwt`
plugin (configured here) mints an asymmetric token with `sub` = the user's UUID
and `role: "authenticated"`, exposed at `/api/auth/jwks`. Register that JWKS URL
as a Supabase **third-party auth** issuer, and every existing policy works
unchanged. Full rationale and the HS256 fallback:
[`docs/better-auth-migration.md`](../../docs/better-auth-migration.md).
