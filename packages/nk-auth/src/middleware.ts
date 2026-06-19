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
 * It will only ever (a) push *cookie-less* requests off `protectedPaths`, and
 * optionally (b) push *cookie-bearing* requests off a front door to the app. It
 * refuses to protect or front-door the sign-in path, because either would
 * reintroduce the loop. Sending a *signed-in* user away from /login is the job
 * of `redirectIfAuthenticated` in the server helpers, which validates first.
 */
import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

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
}

export function createAuthMiddleware(config: AuthMiddlewareConfig) {
	const signInPath = config.signInPath ?? "/login";
	const frontDoorPaths = config.frontDoorPaths ?? [];

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
		const hasSessionCookie = !!getSessionCookie(request);
		const path = request.nextUrl.pathname;

		if (
			!hasSessionCookie &&
			config.protectedPaths.some((p) => path.startsWith(p))
		) {
			const url = request.nextUrl.clone();
			url.pathname = signInPath;
			return NextResponse.redirect(url);
		}

		if (
			hasSessionCookie &&
			config.signedInRedirect &&
			frontDoorPaths.includes(path)
		) {
			const url = request.nextUrl.clone();
			url.pathname = config.signedInRedirect;
			return NextResponse.redirect(url);
		}

		return NextResponse.next();
	};
}
