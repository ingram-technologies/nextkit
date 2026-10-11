import { describe, expect, it } from "vitest";
import { lint as lintRule, ruleIds } from "./oxlint-harness.js";

// Which braces count as arguments is the shared `icuArguments` helper's job and
// is tabled in oxlint-icu-arguments.test.js; these cover the rule's own wiring.
const RULE = "nextkit/t-no-positional-args";
const lint = (source) => lintRule("t-no-positional-args", source);

describe("t-no-positional-args", () => {
	it("flags a positional placeholder and names it", () => {
		const out = lint(`t("Results for {0}", { 0: query });`);
		expect(ruleIds(out)).toEqual([RULE]);
		expect(out[0].message).toContain("{0}");
	});

	it("flags every positional placeholder in a message", () => {
		expect(ruleIds(lint(`t("{0} of {1}", { 0: a, 1: b });`))).toEqual([RULE, RULE]);
	});

	it("accepts named placeholders", () => {
		expect(lint(`t("Results for {query}", { query });`)).toEqual([]);
	});

	it("does not read digit sub-messages of a select as positional", () => {
		// `{0}` and `{1}` here are sub-message bodies, not arguments; only a
		// working brace-depth scan keeps them from reporting.
		expect(lint(`t("{n, select, a {0} other {1}}", { n });`)).toEqual([]);
	});

	it("ignores calls to functions other than the translator", () => {
		expect(lint(`format("Results for {0}");`)).toEqual([]);
	});
});
