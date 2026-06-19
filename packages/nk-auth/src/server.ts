/**
 * Server-side session helpers for the App Router, at
 * "@ingram-tech/nk-auth/server" so the framework-agnostic core entry never
 * pulls in `next`. A site binds these once to its own Better Auth instance:
 *
 *   // lib/auth/session.ts
 *   import { createAuthHelpers } from "@ingram-tech/nk-auth/server";
 *   import { auth } from "@/lib/auth";
 *
 *   export const { getSession, getUser, requireUser, redirectIfAuthenticated } =
 *     createAuthHelpers(auth);
 *
 * These are the **validated** authority: every call hits `auth.api.getSession`,
 * which checks the session against the database — not merely the presence of a
 * cookie. That distinction is the whole point. The optimistic, cookie-presence
 * check belongs in middleware (see "@ingram-tech/nk-auth/middleware"); it may
 * only ever push *unauthenticated* users off protected routes. The decision to
 * send a signed-in user *away* from the sign-in page must run through
 * `redirectIfAuthenticated` here, so a stale or revoked cookie resolves to "no
 * session" and falls through to the form instead of ping-ponging forever.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";

/** The shape we need from a session: anything carrying a `user`. */
interface SessionLike {
	user: unknown;
}

/**
 * The slice of a Better Auth instance these helpers touch. Generic over the
 * site's session type `S`, so `getSession`/`getUser` return the site's fully
 * inferred user shape (additional fields, org id, …) — no `any`, no casts.
 */
interface AuthLike<S extends SessionLike> {
	api: {
		getSession: (input: { headers: Headers }) => Promise<S | null>;
	};
}

export function createAuthHelpers<S extends SessionLike>(auth: AuthLike<S>) {
	/** The validated session ({ user, session, … }) or null. */
	async function getSession(): Promise<S | null> {
		return auth.api.getSession({ headers: await headers() });
	}

	/**
	 * Require a session or redirect, returning the full validated session (use
	 * when the caller needs more than the user — session id, active org, …).
	 */
	async function requireSession(redirectTo = "/login"): Promise<S> {
		const session = await getSession();
		// redirect() is typed `never`, so `session` narrows to non-null below.
		if (!session) redirect(redirectTo);
		return session;
	}

	/** The authenticated user, or null. */
	async function getUser(): Promise<S["user"] | null> {
		const session = await getSession();
		return session?.user ?? null;
	}

	/**
	 * Require a signed-in user or redirect. Returns the user (non-null) so
	 * callers keep their `const user = await requireUser()` shape. `redirect()`
	 * throws, so control never returns when signed out.
	 */
	async function requireUser(redirectTo = "/login"): Promise<S["user"]> {
		const user = await getUser();
		// redirect() is typed `never`, so `user` narrows to non-null below.
		if (!user) redirect(redirectTo);
		return user;
	}

	/**
	 * Redirect an already-signed-in user away (e.g. /login -> /dashboard). This
	 * is the *correct* place to gate the sign-in page: because it validates the
	 * session, a present-but-invalid cookie is treated as signed-out and the
	 * page renders instead of looping. Never do this in middleware.
	 */
	async function redirectIfAuthenticated(to: string): Promise<void> {
		if (await getSession()) redirect(to);
	}

	return {
		getSession,
		getUser,
		requireSession,
		requireUser,
		redirectIfAuthenticated,
	};
}
