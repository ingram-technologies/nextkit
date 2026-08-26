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
 * These are the **validated** authority: they resolve through
 * `auth.api.getSession`, which checks the session against the database — not
 * merely the presence of a cookie. The read is memoized per request with React
 * `cache()`, so a render fanning out many `getUser()` calls validates once,
 * not once per call. When a guard finds no valid session it redirects to the sign-in page,
 * preserving the requested path as `next` (read from the header the middleware
 * injects) and, when a session cookie is present-but-invalid, adding `stale=1`
 * so the middleware clears the dead cookie. The optimistic, cookie-presence
 * check belongs in middleware (see "@ingram-tech/nk-auth/middleware"); it may
 * only ever push *unauthenticated* users off protected routes. The decision to
 * send a signed-in user *away* from the sign-in page must run through
 * `redirectIfAuthenticated` here, so a stale cookie resolves to "no session"
 * and falls through to the form instead of ping-ponging forever.
 */
import type { IdHelper } from "@ingram-tech/nk-db/id";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
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

/**
 * The registry helpers for the ids a session carries. With these, every
 * session read through the helpers presents `user.id` / `session.userId` as
 * the user's public id and `session.activeOrganizationId` as the
 * organization's, so app code compares session ids with `idColumn` reads in
 * one form. Better Auth itself keeps working on raw uuids underneath.
 */
export interface SessionIds {
	user: IdHelper;
	organization?: IdHelper;
}

export interface AuthHelpersOptions {
	/** Where guards send unauthenticated users. Default `/login`. */
	signInPath?: string;
	/**
	 * Encode session ids to their public form on every read (see
	 * {@link SessionIds}). Omit on a site that has no public id form: the
	 * helpers then return Better Auth's raw uuids.
	 */
	ids?: SessionIds;
	/**
	 * Cookie-name fragment that identifies the Better Auth session cookie, used
	 * to detect a present-but-invalid (stale) cookie. Default `better-auth`,
	 * which matches `better-auth.session_token` and `__Secure-…` in production.
	 */
	sessionCookiePrefix?: string;
}

const encodeIfString = (helper: IdHelper | undefined, value: unknown): unknown =>
	helper && typeof value === "string" ? helper.encode(value) : value;

/**
 * A session with its ids in public form: `user.id`, `session.userId` and
 * `session.activeOrganizationId` (each only when present and a string). Pure —
 * Better Auth's own object is left untouched, since it is what the adapter
 * writes back. `encode` is idempotent, so an already-public id is unchanged.
 */
export function encodeSessionIds<S extends SessionLike>(
	session: S,
	ids: SessionIds,
): S {
	const out: Record<string, unknown> = { ...(session as Record<string, unknown>) };
	const user = session.user;
	if (user && typeof user === "object" && "id" in user) {
		out.user = { ...user, id: encodeIfString(ids.user, user.id) };
	}
	const inner = "session" in session ? session.session : undefined;
	if (inner && typeof inner === "object") {
		const rec = inner as Record<string, unknown>;
		out.session = {
			...rec,
			...("userId" in rec
				? { userId: encodeIfString(ids.user, rec.userId) }
				: {}),
			...("activeOrganizationId" in rec
				? {
						activeOrganizationId: encodeIfString(
							ids.organization,
							rec.activeOrganizationId,
						),
					}
				: {}),
		};
	}
	return out as S;
}

export function createAuthHelpers<S extends SessionLike>(
	auth: AuthLike<S>,
	options: AuthHelpersOptions = {},
) {
	const signInPath = options.signInPath ?? "/login";
	const cookiePrefix = options.sessionCookiePrefix ?? "better-auth";

	/**
	 * The validated session ({ user, session, … }) or null. Memoized per request
	 * via React `cache()`: the session cookie is constant within a request, so
	 * every helper (and every component calling one) shares a single database
	 * validation. Outside a request scope (scripts, tests) `cache()` degrades to
	 * an uncached call.
	 *
	 * Caveat: code that mutates the session mid-request (e.g. a server action
	 * updating the user) and then re-reads it through these helpers sees the
	 * pre-mutation snapshot; re-read through `auth.api.getSession` directly if
	 * that ever matters.
	 */
	const getSession = cache(async (): Promise<S | null> => {
		const session = await auth.api.getSession({ headers: await headers() });
		return session && options.ids
			? encodeSessionIds(session, options.ids)
			: session;
	});

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
