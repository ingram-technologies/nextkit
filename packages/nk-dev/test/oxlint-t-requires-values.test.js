import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const pluginPath = join(
	dirname(fileURLToPath(import.meta.url)),
	"../lib/oxlint-plugins/index.js",
);

const dirs = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

const lint = (source) => {
	const dir = mkdtempSync(join(tmpdir(), "nk-oxlint-t-values-"));
	dirs.push(dir);
	writeFileSync(
		join(dir, ".oxlintrc.json"),
		JSON.stringify({
			jsPlugins: [pluginPath],
			rules: { "nextkit/t-requires-values": "error" },
		}),
	);
	writeFileSync(join(dir, "fixture.ts"), source);
	try {
		execFileSync("oxlint", ["-c", ".oxlintrc.json", "fixture.ts"], {
			cwd: dir,
			encoding: "utf8",
		});
		return "";
	} catch (error) {
		return String(error.stdout ?? "");
	}
};

describe("t-requires-values", () => {
	it("flags a message with a placeholder and no values argument", () => {
		const output = lint(`t("Results for {query}");`);
		expect(output).toContain("t-requires-values");
		expect(output).toContain("`query`");
	});

	it("names every missing placeholder", () => {
		const output = lint(`t("Showing {from}-{to} of {total, number} codes");`);
		expect(output).toContain("`from`, `to`, `total`");
	});

	it("flags a misspelled key in the values object", () => {
		const output = lint(`t("Results for {query}", { qeury });`);
		expect(output).toContain("missing `query`");
	});

	it("accepts a message whose values are all supplied", () => {
		expect(lint(`t("Results for {query}", { query });`)).toBe("");
	});

	it("reads only the top-level argument of a plural, not its sub-messages", () => {
		expect(
			lint(`t("{count, plural, one {# item} other {# items}}", { count });`),
		).toBe("");
	});

	it("ignores embedded JSON, which is text rather than a placeholder", () => {
		expect(lint(`t('This is JSON: {"a": 1}');`)).toBe("");
	});

	it("ignores empty and non-identifier braces", () => {
		expect(lint(`t("Use {} to clear");`)).toBe("");
		expect(lint(`t("body { color: red }");`)).toBe("");
	});

	it("ignores a message with no braces at all", () => {
		expect(lint(`t("Back to directory");`)).toBe("");
	});

	it("skips a runtime key it cannot read statically", () => {
		expect(lint(`t(key);`)).toBe("");
	});

	it("skips a values argument whose keys are not statically known", () => {
		expect(lint(`t("Results for {query}", values);`)).toBe("");
		expect(lint(`t("Results for {query}", { ...rest });`)).toBe("");
	});

	it("ignores calls to functions other than the translator", () => {
		expect(lint(`format("Results for {query}");`)).toBe("");
	});
});
