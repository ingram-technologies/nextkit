import { describe, expect, it } from "vitest";
import { icuArguments } from "../lib/oxlint-plugins/icu-arguments.js";

const named = (name) => ({ name, positional: false });
const positional = (name) => ({ name, positional: true });

/**
 * Expecteds are hand-picked from ICU MessageFormat: an argument is
 * `{argNameOrNumber}` optionally followed by `, type[, style]`, and the
 * sub-messages of plural/select are message text. Braces that do not open with
 * an identifier or number are literal text in this i18n scheme (the English
 * source is the catalog key, so authors cannot escape them).
 */
describe("icuArguments", () => {
	it.each([
		["no braces", "Back to directory", []],
		["one named argument", "Results for {query}", [named("query")]],
		[
			"arguments in source order, with a formatted one",
			"Showing {from}-{to} of {total, number} codes",
			[named("from"), named("to"), named("total")],
		],
		["positional arguments", "{0} of {1}", [positional("0"), positional("1")]],
		[
			"a plural: only its selector, not the sub-messages",
			"{count, plural, one {# item} other {# items}}",
			[named("count")],
		],
		[
			"a select whose sub-messages look like arguments",
			"{g, select, male {he} other {they}}",
			[named("g")],
		],
		[
			"a select whose sub-messages look like positional arguments",
			"{n, select, a {0} other {1}}",
			[named("n")],
		],
		[
			"an argument after a plural, once depth returns to 0",
			"{count, plural, one {# item} other {# items}} for {name}",
			[named("count"), named("name")],
		],
		["embedded JSON with a string key", 'This is JSON: {"a": 1}', []],
		["embedded JSON with a numeric key", 'Rows: {2: "x"}', []],
		["an empty brace pair", "Use {} to clear", []],
		["a CSS block", "body { color: red }", []],
	])("%s", (_label, message, expected) => {
		expect(icuArguments(message)).toEqual(expected);
	});

	it("misses an argument nested inside a sub-message", () => {
		// Intentional tripwire. ICU counts `{n}` here as an argument too; the
		// helper reads depth 0 only and under-reports by design (a missed lint,
		// never a false one). This fails on purpose if nested arguments start
		// being read, which t-requires-values would then demand as keys.
		expect(icuArguments("{g, select, other {{n} cats}}")).toEqual([named("g")]);
	});

	it("loses arguments after an apostrophe-escaped brace", () => {
		// Intentional tripwire. Per ICU, `'{'` is a literal brace and `{name}`
		// is still an argument; the scan does not model apostrophe quoting, so
		// the unbalanced depth hides it. Documented as an under-report in the
		// helper; this fails on purpose if quoting support lands.
		expect(icuArguments("Use '{' for {name}")).toEqual([]);
	});
});
