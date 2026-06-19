/**
 * A loop-safe Next.js auth middleware factory, at
 * "@ingram-tech/nk-auth/middleware". Middleware runs at the edge before a route
 * renders, so it can only afford an **optimistic** check — the presence of a
 * session cookie (`getSessionCookie`), not a database-validated session.
 *
 * That optimism is exactly what makes naive auth middleware loop. The validated
 * server guard (see "@ingram-tech/nk-auth/server") sends an invalid-but-present
 * session to the sign-in page; if the optimistic layer then bounces the sign-in
 * page back ("you have a cookie, go to the app"), a stale cookie ping-pongs
 * forever — and an RSC render can't clear the cookie to break out.
 *
 * So this factory enforces the one safe invariant *at construction*:
 *
 *   The sign-in path is never the target of an optimistic redirect.
 *
 * It also owns the two things only middleware can do here:
 *
 *  - **Preserve the destination.** When it sends an unauthenticated user to
 *    sign-in, it appends `?next=<requested path>`; and it injects an
 *    `x-nk-auth-path` request header so the server guards can do the same for
 *    the cookie-present-but-invalid case (an RSC can't otherwise learn its URL).
 *  - **Clear a stale cookie.** The guard parks an invalid session at
 *    `${signInPath}?stale=1`; middleware (the only pre-render place that can set
 *    cookies) deletes the dead Better Auth cookies and bounces to a clean
 *    sign-in URL, so a bad session self-heals instead of failing every request.
 */
import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { NK_AUTH_PATH_HEADER, safeNextParam } from "./gating-internals";

export interface AuthMiddlewareConfig {
	/**
	 * Path prefixes that require a session. A request without a session cookie
	 * to any of these is redirected to `signInPath`. Matched with `startsWith`.
	 */
	protectedPaths: string[];
	/** Where unauthenticated users are sent. Default `/login`. */
	signInPath?: string;
	/**
	 * Optional front-door redirect: when a session cookie is present and the
	 * path *exactly* equals one of these, redirect to `signedInRedirect`. Safe
	 * because it never targets the sign-in path. Typically `["/"]`.
	 */
	frontDoorPaths?: string[];
	/** Destination for the front-door redirect. Required when `frontDoorPaths` is set. */
	signedInRedirect?: string;
	/**
	 * Cookie-name fragment for the cookies cleared on a stale session. Default
	 * `better-auth`, which matches `better-auth.session_token` and the
	 * `__Secure-…` production variant.
	 */
	sessionCookiePrefix?: string;
}

export function createAuthMiddleware(config: AuthMiddlewareConfig) {
	const signInPath = config.signInPath ?? "/login";
	const frontDoorPaths = config.frontDoorPaths ?? [];
	const cookiePrefix = config.sessionCookiePrefix ?? "better-auth";

	// Loop-safety, enforced once at construction rather than hoped-for per
	// request. The sign-in path is where the validated guard parks an
	// invalid-but-present session; it must never be the target of an optimistic
	// redirect, or a stale cookie loops.
	if (config.protectedPaths.some((p) => signInPath.startsWith(p))) {
		throw new Error(
			`@ingram-tech/nk-auth: signInPath "${signInPath}" must not fall under protectedPaths — a cookie-less visit would redirect to itself forever.`,
		);
	}
	if (frontDoorPaths.includes(signInPath)) {
		throw new Error(
			`@ingram-tech/nk-auth: signInPath "${signInPath}" must not be a frontDoorPath — it would reintroduce the stale-cookie redirect loop.`,
		);
	}
	if (frontDoorPaths.length > 0 && !config.signedInRedirect) {
		throw new Error(
			"@ingram-tech/nk-auth: signedInRedirect is required when frontDoorPaths is set.",
		);
	}

	return function middleware(request: NextRequest): NextResponse {
		const path = request.nextUrl.pathname;

		// 1. Stale-session handshake. The validated guard sends an invalid session
		//    to `${signInPath}?stale=1&next=…`. Clear the dead Better Auth cookies
		//    (only middleware can, pre-render) and bounce to a clean sign-in URL
		//    that keeps `next`. After this the cookie is gone, so it can't re-arm.
		if (path === signInPath && request.nextUrl.searchParams.get("stale") === "1") {
			const to = request.nextUrl.clone();
			to.searchParams.delete("stale");
			const res = NextResponse.redirect(to);
			for (const cookie of request.cookies.getAll()) {
				if (cookie.name.includes(cookiePrefix)) res.cookies.delete(cookie.name);
			}
			return res;
		}

		const hasSessionCookie = !!getSessionCookie(request);

		// 2. Unauthenticated (no cookie) on a protected path -> sign in, and
		//    remember where they were going.
		if (
			!hasSessionCookie &&
			config.protectedPaths.some((p) => path.startsWith(p))
		) {
			const original = request.nextUrl.pathname + request.nextUrl.search;
			const to = request.nextUrl.clone();
			to.pathname = signInPath;
			to.search = "";
			const next = safeNextParam(original);
			if (next) to.searchParams.set("next", next);
			return NextResponse.redirect(to);
		}

		// 3. Front door: a cookie-bearing visit to "/" (or configured) -> the app.
		if (
			hasSessionCookie &&
			config.signedInRedirect &&
			frontDoorPaths.includes(path)
		) {
			const to = request.nextUrl.clone();
			to.pathname = config.signedInRedirect;
			to.search = "";
			return NextResponse.redirect(to);
		}

		// 4. Pass through, injecting the requested path so server guards can build
		//    `next` for the cookie-present-but-invalid case.
		const requestHeaders = new Headers(request.headers);
		requestHeaders.set(NK_AUTH_PATH_HEADER, path + request.nextUrl.search);
		return NextResponse.next({ request: { headers: requestHeaders } });
	};
}
