import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuthMiddleware } from "./middleware.js";

// Control the optimistic cookie-presence check without coupling to better-auth's
// cookie-name internals: the middleware's logic is what we're testing.
let cookiePresent = false;
vi.mock("better-auth/cookies", () => ({
	getSessionCookie: () => (cookiePresent ? "token.sig" : null),
}));

afterEach(() => {
	cookiePresent = false;
});

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
		cookiePresent = false;
		const url = loc(mw(req("/dashboard")));
		expect(url?.pathname).toBe("/login");
		expect(url?.searchParams.get("next")).toBe("/dashboard");
	});

	it("lets a cookie-less request through on a public path", () => {
		cookiePresent = false;
		expect(loc(mw(req("/about")))).toBeNull();
	});

	it("redirects a cookie-bearing request off the front door to the app", () => {
		cookiePresent = true;
		expect(loc(mw(req("/")))?.pathname).toBe("/app");
	});

	it("NEVER bounces the sign-in page, even with a cookie (anti-loop)", () => {
		// A stale-but-present cookie lands on /login and stays, so the validated
		// server guard can render the form.
		cookiePresent = true;
		expect(loc(mw(req("/login")))).toBeNull();
	});

	it("lets a cookie-bearing request through on a protected path (server validates)", () => {
		cookiePresent = true;
		expect(loc(mw(req("/app/settings")))).toBeNull();
	});

	it("clears the dead cookie on the stale handshake and keeps next", () => {
		// The validated guard parks an invalid session at /login?stale=1&next=…
		cookiePresent = true;
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

	it("does not gate longer path segments sharing a protected prefix", () => {
		cookiePresent = false;
		// "/app" must not gate "/application".
		expect(loc(mw(req("/application")))).toBeNull();
	});
});
