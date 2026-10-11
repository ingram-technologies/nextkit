import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import {
	clearStaleSession,
	createAuthMiddleware,
	withAuthPathHeader,
} from "./middleware.js";

// The optimistic check is Better Auth's real `getSessionCookie`, so requests
// carry the cookie a signed-in browser actually sends.
const SESSION = "better-auth.session_token=token.sig";

const req = (path: string, init?: { cookie?: string }) =>
	new NextRequest(new URL(`https://example.com${path}`), {
		headers: init?.cookie ? { cookie: init.cookie } : undefined,
	});
const loc = (res: { headers: Headers }) => {
	const l = res.headers.get("location");
	return l ? new URL(l) : null;
};

describe("createAuthMiddleware — construction-time loop safety", () => {
	it("rejects a signInPath that falls under protectedPaths (cookie-less self-loop)", () => {
		expect(() =>
			createAuthMiddleware({ protectedPaths: ["/login"], signInPath: "/login" }),
		).toThrow(/must not fall under protectedPaths/);
		// Segment-boundary, not prefix: a nested sign-in under a protected root loops.
		expect(() =>
			createAuthMiddleware({
				protectedPaths: ["/app"],
				signInPath: "/app/login",
			}),
		).toThrow(/must not fall under protectedPaths/);
	});

	it("allows a signInPath that only shares a string prefix with a protectedPath", () => {
		// "/login" is NOT gated by "/log" or "/" under segment-boundary matching,
		// so the construction guard must not false-positive on the shared prefix.
		expect(() =>
			createAuthMiddleware({ protectedPaths: ["/log"], signInPath: "/login" }),
		).not.toThrow();
		expect(() =>
			createAuthMiddleware({ protectedPaths: ["/"], signInPath: "/login" }),
		).not.toThrow();
	});

	it("rejects a signInPath used as a frontDoorPath (the stale-cookie loop)", () => {
		expect(() =>
			createAuthMiddleware({
				protectedPaths: ["/app"],
				frontDoorPaths: ["/login"],
				signedInRedirect: "/app",
			}),
		).toThrow(/reintroduce the stale-cookie redirect loop/);
	});

	it("requires signedInRedirect when frontDoorPaths is set", () => {
		expect(() =>
			createAuthMiddleware({ protectedPaths: ["/app"], frontDoorPaths: ["/"] }),
		).toThrow(/signedInRedirect is required/);
	});
});

describe("createAuthMiddleware — request behavior", () => {
	const mw = createAuthMiddleware({
		protectedPaths: ["/app", "/dashboard"],
		signInPath: "/login",
		frontDoorPaths: ["/"],
		signedInRedirect: "/app",
	});

	it("redirects a cookie-less request off a protected path, preserving next", () => {
		const url = loc(mw(req("/dashboard")));
		expect(url?.pathname).toBe("/login");
		expect(url?.searchParams.get("next")).toBe("/dashboard");
	});

	it("lets a cookie-less request through on a public path", () => {
		expect(loc(mw(req("/about")))).toBeNull();
	});

	it("redirects a cookie-bearing request off the front door to the app", () => {
		expect(loc(mw(req("/", { cookie: SESSION })))?.pathname).toBe("/app");
	});

	it("NEVER bounces the sign-in page, even with a cookie (anti-loop)", () => {
		// A stale-but-present cookie lands on /login and stays, so the validated
		// server guard can render the form.
		expect(loc(mw(req("/login", { cookie: SESSION })))).toBeNull();
	});

	it("lets a cookie-bearing request through on a protected path (server validates)", () => {
		expect(loc(mw(req("/app/settings", { cookie: SESSION })))).toBeNull();
	});

	it("clears the dead cookie on the stale handshake and keeps next", () => {
		// The validated guard parks an invalid session at /login?stale=1&next=…
		const res = mw(
			req("/login?stale=1&next=/dashboard", {
				cookie: "__Secure-better-auth.session_token=dead.sig",
			}),
		);
		const url = loc(res);
		expect(url?.pathname).toBe("/login");
		expect(url?.searchParams.get("stale")).toBeNull();
		expect(url?.searchParams.get("next")).toBe("/dashboard");
		// The Better Auth cookie is expired on the redirect response. The deletion
		// Set-Cookie for a __Secure- cookie must itself carry Secure, or browsers
		// reject it and the dead cookie survives.
		const deletion = res.headers
			.getSetCookie()
			.find((c) => c.includes("__Secure-better-auth.session_token="));
		expect(deletion).toBeTruthy();
		expect(deletion?.toLowerCase()).toContain("secure");
	});

	it("detects the session cookie under the app's own prefix", () => {
		const mw = createAuthMiddleware({
			protectedPaths: ["/app"],
			sessionCookiePrefix: "acme",
		});
		expect(loc(mw(req("/app", { cookie: "acme.session_token=t.sig" })))).toBeNull();
		expect(
			loc(mw(req("/app", { cookie: "__Secure-acme.session_token=t.sig" }))),
		).toBeNull();
		// Another app's cookie on the shared parent domain is not this app's session.
		expect(loc(mw(req("/app", { cookie: SESSION })))?.pathname).toBe("/login");
	});

	it("does not gate longer path segments sharing a protected prefix", () => {
		// "/app" must not gate "/application".
		expect(loc(mw(req("/application")))).toBeNull();
	});
});

describe("createAuthMiddleware — the two halves, composed and standalone", () => {
	const mw = createAuthMiddleware({ protectedPaths: ["/app"], signInPath: "/login" });

	it("forwards the requested path + query to the app on pass-through", () => {
		const res = mw(req("/app/settings?tab=a", { cookie: SESSION }));
		expect(res.headers.get("x-middleware-request-x-nk-auth-path")).toBe(
			"/app/settings?tab=a",
		);
	});

	it("forwards the caller's own requestHeaders alongside the auth path", () => {
		const request = req("/app", { cookie: SESSION });
		const requestHeaders = new Headers(request.headers);
		requestHeaders.set("x-tenant", "acme");
		const res = mw(request, { requestHeaders });
		expect(res.headers.get("x-middleware-request-x-tenant")).toBe("acme");
		expect(res.headers.get("x-middleware-request-x-nk-auth-path")).toBe("/app");
	});

	it("withAuthPathHeader sets the header, overriding a client-sent one", () => {
		const request = new NextRequest(new URL("https://example.com/app?x=1"), {
			headers: { "x-nk-auth-path": "/evil" },
		});
		const requestHeaders = new Headers(request.headers);
		withAuthPathHeader(request, requestHeaders);
		expect(requestHeaders.get("x-nk-auth-path")).toBe("/app?x=1");
	});

	it("clearStaleSession is null off the handshake and clears on it", () => {
		expect(clearStaleSession(req("/login"))).toBeNull();
		expect(clearStaleSession(req("/app?stale=1"))).toBeNull();
		expect(
			clearStaleSession(req("/signin?stale=1"), { signInPath: "/login" }),
		).toBeNull();
		const res = clearStaleSession(
			req("/login?stale=1&next=/app", {
				cookie: "better-auth.session_token=dead",
			}),
		);
		const url = res ? loc(res) : null;
		expect(url?.pathname).toBe("/login");
		expect(url?.searchParams.get("stale")).toBeNull();
		expect(url?.searchParams.get("next")).toBe("/app");
		expect(
			res?.headers
				.getSetCookie()
				.some((c) => c.startsWith("better-auth.session_token=")),
		).toBe(true);
	});

	it("clearStaleSession leaves cookies outside the session prefix alone", () => {
		const res = clearStaleSession(
			req("/login?stale=1", {
				cookie: "better-auth.session_token=dead; theme=dark; NEXT_LOCALE=fr",
			}),
		);
		const cleared = (res?.headers.getSetCookie() ?? []).map((c) => c.split("=")[0]);
		expect(cleared).toEqual(["better-auth.session_token"]);
	});

	it("honors a custom nextParam and isSafeNext on the cookie-less redirect", () => {
		const custom = createAuthMiddleware({
			protectedPaths: ["/app"],
			nextParam: "redirectTo",
			isSafeNext: (v) => (v.startsWith("/app") ? v : null),
		});
		const url = loc(custom(req("/app/x")));
		expect(url?.searchParams.get("redirectTo")).toBe("/app/x");
		expect(url?.searchParams.get("next")).toBeNull();
	});
});
