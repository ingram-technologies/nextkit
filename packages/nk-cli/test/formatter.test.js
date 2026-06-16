import { describe, expect, it } from "vitest";
import { FORMATTER } from "../lib/formatter.js";

// This guards the prime-directive carve-out: nk must only orchestrate standard
// tools. If a command ever resolved to something other than a plain oxlint/oxfmt
// invocation, that's an interception and this test should fail.
describe("FORMATTER", () => {
	it("maps each op to a standard oxlint/oxfmt invocation", () => {
		expect(FORMATTER.name).toBe("oxc");
		expect(FORMATTER.lint).toEqual(["oxlint", []]);
		expect(FORMATTER.write).toEqual(["oxfmt", ["--write", "."]]);
		expect(FORMATTER.checkFormat).toEqual(["oxfmt", ["--check", "."]]);
	});
});
