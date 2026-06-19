import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuthMiddleware } from "./middleware";

// Control the optimistic cookie-presence check without coupling to better-auth's
// cookie-name internals: the middleware's logic is what we're testing.
let cookiePresent = false;
vi.mock("better-auth/cookies", () => ({
	getSessionCookie: () => (cookiePresent ? "token.sig" : null),
}));

afterEach(() => {
	cookiePresent = false;
});

const req = (path: string) => new NextRequest(new URL(`https://example.com${path}`));
const location = (res: { headers: Headers }) => res.headers.get("location");

describe("createAuthMiddleware — construction-time loop safety", () => {
	it("rejects a signInPath that falls under protectedPaths (cookie-less self-loop)", () => {
		expect(() =>
			createAuthMiddleware({ protectedPaths: ["/"], signInPath: "/login" }),
		).toThrow(/must not fall under protectedPaths/);
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

	it("redirects a cookie-less request off a protected path to signInPath", () => {
		cookiePresent = false;
		expect(location(mw(req("/dashboard")))).toBe("https://example.com/login");
	});

	it("lets a cookie-less request through on a public path", () => {
		cookiePresent = false;
		expect(location(mw(req("/about")))).toBeNull();
	});

	it("redirects a cookie-bearing request off the front door to the app", () => {
		cookiePresent = true;
		expect(location(mw(req("/")))).toBe("https://example.com/app");
	});

	it("NEVER bounces the sign-in page, even with a cookie (anti-loop)", () => {
		// This is the whole point: a stale-but-present cookie lands on /login and
		// stays, so the validated server guard can render the form.
		cookiePresent = true;
		expect(location(mw(req("/login")))).toBeNull();
	});

	it("lets a cookie-bearing request through on a protected path (server validates)", () => {
		cookiePresent = true;
		expect(location(mw(req("/app/settings")))).toBeNull();
	});
});
