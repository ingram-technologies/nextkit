import { describe, expect, it } from "vitest";
import { FORMATTER } from "../lib/formatter.js";

// This guards the prime-directive carve-out: nk must only orchestrate standard
// tools. If a command ever resolved to something other than a plain oxlint/oxfmt
// invocation, that's an interception and this test should fail.
describe("FORMATTER", () => {
	it("maps each op to a plain oxlint or oxfmt invocation", () => {
		for (const op of ["lint", "write", "checkFormat"]) {
			expect(["oxlint", "oxfmt"]).toContain(FORMATTER[op][0]);
		}
	});

	it("writes only on the write op", () => {
		expect(FORMATTER.write[1]).toContain("--write");
		expect(FORMATTER.checkFormat[1]).toContain("--check");
		expect(FORMATTER.checkFormat[1]).not.toContain("--write");
	});
});
