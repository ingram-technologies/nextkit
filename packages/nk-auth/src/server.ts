/**
 * Server-side session helpers for the App Router, at
 * "@ingram-tech/nk-auth/server" so the framework-agnostic core entry never
 * pulls in `next`. A site binds these once to its own Better Auth instance:
 *
 *   // lib/auth/session.ts
 *   import { createAuthHelpers } from "@ingram-tech/nk-auth/server";
 *   import { auth } from "@/lib/auth";
 *
 *   export const { getSession, getUser, requireSession, requireUser,
 *     redirectIfAuthenticated } = createAuthHelpers(auth);
 *
 * These are the **validated** authority: every call hits `auth.api.getSession`,
 * which checks the session against the database — not merely the presence of a
 * cookie. When a guard finds no valid session it redirects to the sign-in page,
 * preserving the requested path as `next` (read from the header the middleware
 * injects) and, when a session cookie is present-but-invalid, adding `stale=1`
 * so the middleware clears the dead cookie. The optimistic, cookie-presence
 * check belongs in middleware (see "@ingram-tech/nk-auth/middleware"); it may
 * only ever push *unauthenticated* users off protected routes. The decision to
 * send a signed-in user *away* from the sign-in page must run through
 * `redirectIfAuthenticated` here, so a stale cookie resolves to "no session"
 * and falls through to the form instead of ping-ponging forever.
 */
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NK_AUTH_PATH_HEADER, signInUrl } from "./gating-internals.js";
import { CREDENTIAL_PROVIDER_ID } from "./password.js";

/**
 * Validate a `next` redirect param: returns it only if it's an internal,
 * non-protocol-relative path, else null. Use on the login page before honoring
 * `?next=` so it can't become an open redirect.
 */
export { safeNextParam as safeNext } from "./gating-internals.js";

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
		/**
		 * Better Auth's `/list-accounts`: the auth methods linked to the current
		 * session's user, each `{ providerId }` ("credential" for email/password,
		 * or a social provider like "google"). Present on every real `betterAuth()`
		 * instance; powers `getLinkedProviders` / `hasCredentialAccount` below.
		 */
		listUserAccounts: (input: {
			headers: Headers;
		}) => Promise<Array<{ providerId: string }>>;
	};
}

export interface AuthHelpersOptions {
	/** Where guards send unauthenticated users. Default `/login`. */
	signInPath?: string;
	/**
	 * Cookie-name fragment that identifies the Better Auth session cookie, used
	 * to detect a present-but-invalid (stale) cookie. Default `better-auth`,
	 * which matches `better-auth.session_token` and `__Secure-…` in production.
	 */
	sessionCookiePrefix?: string;
}

export function createAuthHelpers<S extends SessionLike>(
	auth: AuthLike<S>,
	options: AuthHelpersOptions = {},
) {
	const signInPath = options.signInPath ?? "/login";
	const cookiePrefix = options.sessionCookiePrefix ?? "better-auth";

	/** The validated session ({ user, session, … }) or null. */
	async function getSession(): Promise<S | null> {
		return auth.api.getSession({ headers: await headers() });
	}

	/** The authenticated user, or null. */
	async function getUser(): Promise<S["user"] | null> {
		const session = await getSession();
		return session?.user ?? null;
	}

	/**
	 * The sign-in redirect for a request with no valid session: keep the
	 * requested path as `next` (from the middleware-injected header), and flag
	 * `stale=1` when a session cookie is present-but-invalid so the middleware
	 * clears it. The two reads are request-scoped and cached by Next.
	 */
	async function signInTarget(): Promise<string> {
		const [h, c] = await Promise.all([headers(), cookies()]);
		const next = h.get(NK_AUTH_PATH_HEADER);
		const stale = c.getAll().some((ck) => ck.name.includes(cookiePrefix));
		return signInUrl(signInPath, { next, stale });
	}

	/**
	 * Require a signed-in user or redirect to sign-in. Returns the user (non-null)
	 * so callers keep their `const user = await requireUser()` shape. `redirect()`
	 * throws, so control never returns when signed out.
	 */
	async function requireUser(): Promise<S["user"]> {
		const user = await getUser();
		// redirect() is typed `never`, so `user` narrows to non-null below.
		if (!user) redirect(await signInTarget());
		return user;
	}

	/**
	 * Require a session or redirect, returning the full validated session (use
	 * when the caller needs more than the user — session id, active org, …).
	 */
	async function requireSession(): Promise<S> {
		const session = await getSession();
		if (!session) redirect(await signInTarget());
		return session;
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

	/**
	 * The `providerId`s linked to the current session's user — "credential" for
	 * email/password, plus any social providers ("google", …). Empty when signed
	 * out. Reads Better Auth's own `/list-accounts`, so a site never queries the
	 * `account` table or hard-codes provider strings itself.
	 */
	async function getLinkedProviders(): Promise<string[]> {
		const accounts = await auth.api.listUserAccounts({
			headers: await headers(),
		});
		return accounts.map((account) => account.providerId);
	}

	/**
	 * Whether the current user has an email/password credential. Drives the
	 * "Change password" vs "Set password" decision on a security page: a user who
	 * signed up purely through a social provider has none until they set one
	 * (typically via the reset-password / forgot-password flow — see the
	 * `useResetPassword` client hook). Returns false when signed out.
	 */
	async function hasCredentialAccount(): Promise<boolean> {
		const providers = await getLinkedProviders();
		return providers.includes(CREDENTIAL_PROVIDER_ID);
	}

	return {
		getSession,
		getUser,
		requireSession,
		requireUser,
		redirectIfAuthenticated,
		getLinkedProviders,
		hasCredentialAccount,
	};
}
