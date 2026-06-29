import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, getClientKey, rateLimit } from "./rate-limit";

// Each test uses a unique key so the module-level bucket map can't leak state
// between cases.
let n = 0;
const freshKey = () => `test-${Date.now()}-${n++}`;

describe("checkRateLimit", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("allows up to the limit then blocks, decrementing remaining", () => {
		const key = freshKey();
		expect(checkRateLimit({ key, limit: 2, windowMs: 1000 })).toMatchObject({
			success: true,
			remaining: 1,
		});
		expect(checkRateLimit({ key, limit: 2, windowMs: 1000 })).toMatchObject({
			success: true,
			remaining: 0,
		});
		expect(checkRateLimit({ key, limit: 2, windowMs: 1000 })).toMatchObject({
			success: false,
			remaining: 0,
		});
	});

	it("starts a fresh window after the previous one expires", () => {
		vi.useFakeTimers();
		const key = freshKey();
		expect(checkRateLimit({ key, limit: 1, windowMs: 1000 }).success).toBe(true);
		expect(checkRateLimit({ key, limit: 1, windowMs: 1000 }).success).toBe(false);
		vi.advanceTimersByTime(1001);
		expect(checkRateLimit({ key, limit: 1, windowMs: 1000 }).success).toBe(true);
	});
});

describe("getClientKey", () => {
	it("prefers the first x-forwarded-for hop", () => {
		const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
		expect(getClientKey(headers)).toBe("1.2.3.4");
	});

	it("falls back to x-real-ip then to unknown", () => {
		expect(getClientKey(new Headers({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
		expect(getClientKey(new Headers())).toBe("unknown");
	});
});

describe("rateLimit middleware", () => {
	const appFor = (key: string) => {
		const app = new Hono();
		app.use("*", rateLimit({ limit: 1, windowMs: 60_000, key: () => key }));
		app.get("/", (c) => c.text("ok"));
		return app;
	};

	it("passes the first request and 429s the second with Retry-After", async () => {
		const app = appFor(freshKey());
		const first = await app.request("/");
		expect(first.status).toBe(200);
		expect(first.headers.get("x-ratelimit-remaining")).toBe("0");

		const second = await app.request("/");
		expect(second.status).toBe(429);
		expect(second.headers.get("retry-after")).toBeTruthy();
		expect(await second.json()).toEqual({ error: "Too many requests" });
	});
});
