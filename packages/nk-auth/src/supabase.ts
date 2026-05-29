import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The RLS-aware Supabase data client — the single chokepoint that keeps Row
 * Level Security working after the move off Supabase Auth.
 *
 * Instead of `supabase.auth`, it pulls the Better Auth session JWT (via the
 * injected `getToken`) and hands it to supabase-js's v2 `accessToken` callback.
 * PostgREST then sets `request.jwt.claims`, so `auth.uid()` (and every existing
 * policy) keeps returning the right user. With no session, `getToken` yields
 * `null` and the request runs as `anon` — RLS is still enforced, never bypassed.
 *
 * Sites should import THIS rather than constructing supabase-js directly, so the
 * token bridge can't be forgotten. (Enforce with a Biome/GritQL rule banning raw
 * `createClient` for data — see docs/better-auth-migration.md.)
 *
 * Wire `getToken` to the site's own Better Auth instance, e.g.:
 *   getToken: async () => (await auth.api.getToken({ headers }))?.token ?? null
 */

export interface ServerSupabaseConfig {
	/** Returns the current request's Better Auth JWT, or null when signed out. */
	getToken: () => Promise<string | null>;
	supabaseUrl: string;
	supabaseAnonKey: string;
}

export const createServerSupabase = (config: ServerSupabaseConfig): SupabaseClient =>
	createClient(config.supabaseUrl, config.supabaseAnonKey, {
		accessToken: async () => {
			const token = await config.getToken();
			return token ?? "";
		},
	});
