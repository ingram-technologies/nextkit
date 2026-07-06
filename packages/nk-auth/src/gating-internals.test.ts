import { describe, expect, it } from "vitest";
import { safeNextParam, signInUrl } from "./gating-internals.js";

describe("safeNextParam", () => {
	it("accepts plain internal paths", () => {
		expect(safeNextParam("/dashboard")).toBe("/dashboard");
		expect(safeNextParam("/app/settings?tab=a&b=c")).toBe(
			"/app/settings?tab=a&b=c",
		);
	});

	it("rejects empty, external, and protocol-relative values", () => {
		expect(safeNextParam(null)).toBeNull();
		expect(safeNextParam(undefined)).toBeNull();
		expect(safeNextParam("")).toBeNull();
		expect(safeNextParam("https://evil.com/x")).toBeNull();
		expect(safeNextParam("evil.com")).toBeNull();
		expect(safeNextParam("//evil.com/x")).toBeNull();
	});

	it("rejects backslash forms browsers treat as protocol-relative", () => {
		// WHATWG URL: \ is / for http(s), so these all resolve off-origin.
		expect(safeNextParam("/\\evil.com")).toBeNull();
		expect(safeNextParam("\\/evil.com")).toBeNull();
		expect(safeNextParam("/\\/evil.com")).toBeNull();
		expect(safeNextParam("/x\\y")).toBeNull();
	});

	it("rejects ASCII control characters the URL parser would strip", () => {
		// URLSearchParams has already percent-decoded, so a %2F%09%2Fevil.com
		// arrives here as "/\t/evil.com" and would collapse to //evil.com.
		expect(safeNextParam("/\t/evil.com")).toBeNull();
		expect(safeNextParam("/\n/evil.com")).toBeNull();
		expect(safeNextParam("/\r/evil.com")).toBeNull();
		expect(safeNextParam("/x\u0000y")).toBeNull();
		expect(safeNextParam("/x\u007fy")).toBeNull();
	});
});

describe("signInUrl", () => {
	it("drops an unsafe next instead of propagating it", () => {
		expect(signInUrl("/login", { next: "/\\evil.com" })).toBe("/login");
		expect(signInUrl("/login", { next: "/ok", stale: true })).toBe(
			"/login?next=%2Fok&stale=1",
		);
	});
});
