import { describe, expect, it } from "vitest";
import { lint as lintRule, ruleIds } from "./oxlint-harness.js";

const RULE = "nextkit/no-server-env-in-client";
const lint = (...lines) =>
	lintRule("no-server-env-in-client", lines.join("\n"), { filename: "fixture.tsx" });

/**
 * Next only inlines `NEXT_PUBLIC_*` into client bundles, so any other env var
 * read from a `"use client"` file is `undefined` in the browser while working
 * everywhere else. The failure is silent: the feature just never happens.
 */
describe("nextkit/no-server-env-in-client", () => {
	it("flags a secret read from a client file and names it", () => {
		const out = lint(
			'"use client";',
			"export const key = process.env.STRIPE_SECRET_KEY;",
		);
		expect(ruleIds(out)).toEqual([RULE]);
		expect(out[0].message).toContain("STRIPE_SECRET_KEY");
	});

	it("flags a computed read too", () => {
		const out = lint('"use client";', 'export const k = process.env["API_TOKEN"];');
		expect(ruleIds(out)).toEqual([RULE]);
	});

	it("flags each non-public name destructured from process.env", () => {
		const out = lint(
			'"use client";',
			"const { STRIPE_SECRET_KEY, NEXT_PUBLIC_SITE_URL, API_TOKEN: token } = process.env;",
		);
		expect(ruleIds(out)).toEqual([RULE, RULE]);
		expect(out[0].message).toContain("STRIPE_SECRET_KEY");
		expect(out[1].message).toContain("API_TOKEN");
	});

	it("allows NEXT_PUBLIC_ and NODE_ENV", () => {
		const out = lint(
			'"use client";',
			"export const url = process.env.NEXT_PUBLIC_SITE_URL;",
			'export const dev = process.env.NODE_ENV === "development";',
		);
		expect(out).toEqual([]);
	});

	it("leaves server files alone", () => {
		expect(lint("export const key = process.env.STRIPE_SECRET_KEY;")).toEqual([]);
		expect(lint("const { STRIPE_SECRET_KEY } = process.env;")).toEqual([]);
	});

	it("reads the directive, not the string", () => {
		// "use client" further down the file is a value, not a directive.
		const out = lint(
			'export const mode = "use client";',
			"export const key = process.env.STRIPE_SECRET_KEY;",
		);
		expect(out).toEqual([]);
	});
});
