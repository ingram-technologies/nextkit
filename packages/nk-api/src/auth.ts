/**
 * `createRequireAuth` — an auth-middleware factory parameterized by an identity
 * resolver, so an nk-api app stays decoupled from *how* the user is resolved
 * (Supabase cookies today, Better Auth tomorrow, a bearer token elsewhere).
 *
 * ```ts
 * import { createRequireAuth, type AuthEnv } from "@ingram-tech/nk-api";
 * import { getCurrentUser, type AuthUser } from "@/lib/auth/session";
 *
 * export const requireAuth = createRequireAuth(getCurrentUser);
 * export type AppEnv = AuthEnv<AuthUser>; // routes read c.get("user")
 * ```
 */
import { createMiddleware } from "hono/factory";
import type { MiddlewareHandler } from "hono";

/** Hono env where `requireAuth` has put the resolved user on the context. */
export type AuthEnv<User> = { Variables: { user: User } };

/**
 * Build a `requireAuth` middleware. Calls `resolveUser()`; on a falsy result it
 * short-circuits with a 401 in the standard envelope, otherwise it puts the user
 * on the context (`c.get("user")`) and continues.
 */
export function createRequireAuth<User>(
	resolveUser: () => Promise<User | null | undefined>,
): MiddlewareHandler<AuthEnv<User>> {
	return createMiddleware<AuthEnv<User>>(async (c, next) => {
		const user = await resolveUser();
		if (!user) {
			return c.json({ error: "Unauthorized" }, 401);
		}
		c.set("user", user);
		await next();
		return undefined;
	});
}
