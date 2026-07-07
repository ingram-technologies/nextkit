import { describe, expect, it } from "vitest";
import { absoluteUrl } from "./url.js";

const base = "https://acme.test";

describe("absoluteUrl", () => {
	it("resolves site-relative paths and passes absolute http(s) URLs through", () => {
		expect(absoluteUrl("/about", base)).toBe("https://acme.test/about");
		expect(absoluteUrl("/about", "https://acme.test/")).toBe(
			"https://acme.test/about",
		);
		expect(absoluteUrl("https://other.test/x", base)).toBe("https://other.test/x");
	});

	it("throws on protocol-relative and backslash paths (origin escape)", () => {
		expect(() => absoluteUrl("//evil.com/x", base)).toThrow(
			/outside the site origin/,
		);
		// WHATWG URL treats \ as / for http(s).
		expect(() => absoluteUrl("/\\evil.com/x", base)).toThrow(
			/outside the site origin/,
		);
	});

	it("throws on scheme'd non-http inputs instead of passing them through", () => {
		expect(() => absoluteUrl("javascript:alert(1)", base)).toThrow(
			/outside the site origin/,
		);
	});
});
