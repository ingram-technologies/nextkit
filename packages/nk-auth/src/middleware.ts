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
 *
 * Both halves are also exported on their own — {@link withAuthPathHeader} and
 * {@link clearStaleSession} — for a site whose proxy composes several concerns
 * (locale routing, tenant pinning, …) and does not want the optimistic gate.
 * Without the header the server guards cannot preserve `next` at all, and they
 * say so (a one-time warning outside production); wiring one line into your own
 * proxy is enough to fix that.
 */
import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import {
	NK_AUTH_PATH_HEADER,
	type NextParamOptions,
	signInUrl,
} from "./gating-internals.js";

export type { NextParamOptions } from "./gating-internals.js";

/**
 * Forward the requested path + query to the app as the `x-nk-auth-path` request
 * header, so a server guard can build `next` when it redirects to sign-in. The
 * one line a custom proxy needs for `next` preservation:
 *
 *   const requestHeaders = new Headers(request.headers);
 *   withAuthPathHeader(request, requestHeaders);
 *   return localeProxy(routing, request, { requestHeaders });
 *
 * Set, never passed through: the header is ours to mint, so a client that sends
 * one of its own can't choose where sign-in returns to.
 */
export function withAuthPathHeader(
	request: NextRequest,
	requestHeaders: Headers,
): void {
	requestHeaders.set(
		NK_AUTH_PATH_HEADER,
		request.nextUrl.pathname + request.nextUrl.search,
	);
}

export interface StaleSessionConfig {
	/** The sign-in path the server guards redirect to. Default `/login`. */
	signInPath?: string;
	/** Cookie-name fragment of the cookies to clear. Default `better-auth`. */
	sessionCookiePrefix?: string;
}

/**
 * The stale-session handshake, on its own for a custom proxy. The validated
 * guard sends a present-but-invalid session to `${signInPath}?stale=1&next=…`;
 * this clears the dead Better Auth cookies (only middleware can, pre-render) and
 * returns a redirect to the same URL minus `stale`, which keeps `next`. Returns
 * null on every other request, so a proxy can short-circuit on it:
 *
 *   const stale = clearStaleSession(request, { signInPath: "/login" });
 *   if (stale) return stale;
 *
 * After the redirect the cookie is gone, so the handshake can't re-arm.
 */
export function clearStaleSession(
	request: NextRequest,
	config: StaleSessionConfig = {},
): NextResponse | null {
	const signInPath = config.signInPath ?? "/login";
	const cookiePrefix = config.sessionCookiePrefix ?? "better-auth";
	if (
		request.nextUrl.pathname !== signInPath ||
		request.nextUrl.searchParams.get("stale") !== "1"
	) {
		return null;
	}
	const to = request.nextUrl.clone();
	to.searchParams.delete("stale");
	const res = NextResponse.redirect(to);
	for (const cookie of request.cookies.getAll()) {
		if (cookie.name.includes(cookiePrefix)) {
			// `__Secure-`/`__Host-` cookies: browsers reject the deletion
			// Set-Cookie unless it carries the Secure attribute itself, so a
			// bare delete() would silently leave the dead cookie in place on
			// HTTPS and re-run this handshake on every visit.
			res.cookies.delete({
				name: cookie.name,
				path: "/",
				secure:
					cookie.name.startsWith("__Secure-") ||
					cookie.name.startsWith("__Host-"),
			});
		}
	}
	return res;
}

export interface AuthMiddlewareOptions {
	/**
	 * Headers to forward to the app, if the middleware has its own to add. A
	 * fresh copy of the request's headers is used when omitted; pass your own
	 * when you also set things like a tenant or locale header.
	 */
	requestHeaders?: Headers;
}

export interface AuthMiddlewareConfig extends NextParamOptions {
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

	// Segment-boundary match: "/app" gates "/app" and "/app/x" but not
	// "/application". Used for both the construction-time loop check and the
	// per-request gate, so the two can't drift (a broader construction check
	// would reject safe configs like protectedPaths ["/log"] + signInPath
	// "/login", where "/login" is never actually gated).
	const isProtected = (path: string): boolean =>
		config.protectedPaths.some((p) => path === p || path.startsWith(`${p}/`));

	// Loop-safety, enforced once at construction rather than hoped-for per
	// request. The sign-in path is where the validated guard parks an
	// invalid-but-present session; it must never be the target of an optimistic
	// redirect, or a stale cookie loops.
	if (isProtected(signInPath)) {
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

	return function middleware(
		request: NextRequest,
		options: AuthMiddlewareOptions = {},
	): NextResponse {
		const path = request.nextUrl.pathname;

		// 1. Stale-session handshake: clear the dead cookies and bounce to a clean
		//    sign-in URL that keeps `next`.
		const stale = clearStaleSession(request, {
			signInPath,
			sessionCookiePrefix: cookiePrefix,
		});
		if (stale) return stale;

		const hasSessionCookie = !!getSessionCookie(request);

		// 2. Unauthenticated (no cookie) on a protected path -> sign in, and
		//    remember where they were going.
		if (!hasSessionCookie && isProtected(path)) {
			const original = request.nextUrl.pathname + request.nextUrl.search;
			const to = request.nextUrl.clone();
			to.pathname = signInPath;
			to.search = new URL(
				signInUrl(signInPath, {
					next: original,
					nextParam: config.nextParam,
					isSafeNext: config.isSafeNext,
				}),
				request.nextUrl,
			).search;
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
		const requestHeaders = options.requestHeaders ?? new Headers(request.headers);
		withAuthPathHeader(request, requestHeaders);
		return NextResponse.next({ request: { headers: requestHeaders } });
	};
}
