import { describe, expect, it } from "vitest";
import { lint as lintRule, ruleIds } from "./oxlint-harness.js";

// Which braces count as arguments is the shared `icuArguments` helper's job and
// is tabled in oxlint-icu-arguments.test.js; these cover the rule's own checks.
const RULE = "nextkit/t-requires-values";
const lint = (source) => lintRule("t-requires-values", source);

describe("t-requires-values", () => {
	it("flags a message with a placeholder and no values argument", () => {
		const out = lint(`t("Results for {query}");`);
		expect(ruleIds(out)).toEqual([RULE]);
		expect(out[0].message).toContain("`query`");
	});

	it("names every missing placeholder in one report", () => {
		const out = lint(`t("Showing {from}-{to} of {total, number} codes");`);
		expect(ruleIds(out)).toEqual([RULE]);
		for (const name of ["`from`", "`to`", "`total`"]) {
			expect(out[0].message).toContain(name);
		}
	});

	it("flags a misspelled key in the values object, naming the expected key", () => {
		const out = lint(`t("Results for {query}", { qeury });`);
		expect(ruleIds(out)).toEqual([RULE]);
		expect(out[0].message).toContain("`query`");
	});

	it("accepts a message whose values are all supplied", () => {
		expect(lint(`t("Results for {query}", { query });`)).toEqual([]);
	});

	it("reads only the top-level argument of a select, not its sub-messages", () => {
		// `he` / `they` are sub-message text: requiring them as keys would be a
		// false report only a working brace-depth scan avoids.
		expect(lint(`t("{g, select, male {he} other {they}}", { g });`)).toEqual([]);
	});

	it("ignores a message with no braces at all", () => {
		expect(lint(`t("Back to directory");`)).toEqual([]);
	});

	it("skips a runtime key it cannot read statically", () => {
		expect(lint(`t(key);`)).toEqual([]);
	});

	it("skips a values argument whose keys are not statically known", () => {
		expect(lint(`t("Results for {query}", values);`)).toEqual([]);
		expect(lint(`t("Results for {query}", { ...rest });`)).toEqual([]);
	});

	it("ignores calls to functions other than the translator", () => {
		expect(lint(`format("Results for {query}");`)).toEqual([]);
	});
});
