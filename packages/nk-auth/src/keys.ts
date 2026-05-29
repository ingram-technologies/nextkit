/**
 * Environment contract for @ingram-tech/nk-auth.
 *
 * Following the "each package owns its own env validation" pattern. Env vars are
 * external input, so we parse them with Zod (per docs/code-style.md) rather than
 * reading `process.env` ad hoc. `authEnv()` returns a validated, config-shaped
 * object you can spread straight into `createAuth` / `createServerSupabase`.
 *
 * Required:
 *   BETTER_AUTH_SECRET             — session/CSRF signing key (`openssl rand -hex 32`)
 *   BETTER_AUTH_URL                — canonical site origin, e.g. "https://example.com"
 *   DATABASE_URL                   — DIRECT Postgres connection for Better Auth
 *                                    (session-mode pooler or :5432, NOT PostgREST)
 *   NEXT_PUBLIC_SUPABASE_URL       — Supabase project URL (for the data client)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY  — Supabase anon key (RLS still enforced)
 */

import { z } from "zod";

const schema = z.object({
	BETTER_AUTH_SECRET: z.string().min(1),
	BETTER_AUTH_URL: z.string().url(),
	DATABASE_URL: z.string().min(1),
	NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
	NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export interface AuthEnv {
	secret: string;
	baseURL: string;
	databaseUrl: string;
	supabaseUrl: string;
	supabaseAnonKey: string;
}

/**
 * Read and validate all nk-auth env vars at once. Throws a single error listing
 * everything missing/invalid, so a misconfigured site fails fast at startup
 * rather than at first sign-in.
 */
export const authEnv = (): AuthEnv => {
	const result = schema.safeParse(process.env);
	if (!result.success) {
		const issues = result.error.issues
			.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
			.join(", ");
		throw new Error(`@ingram-tech/nk-auth: invalid environment — ${issues}`);
	}
	const env = result.data;
	return {
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		databaseUrl: env.DATABASE_URL,
		supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
		supabaseAnonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
	};
};

/** Whether nk-auth is fully configured (lets callers degrade in local/dev). */
export const isConfigured = (): boolean => schema.safeParse(process.env).success;
