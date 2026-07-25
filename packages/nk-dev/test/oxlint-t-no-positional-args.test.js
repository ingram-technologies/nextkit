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
	const dir = mkdtempSync(join(tmpdir(), "nk-oxlint-t-positional-"));
	dirs.push(dir);
	writeFileSync(
		join(dir, ".oxlintrc.json"),
		JSON.stringify({
			jsPlugins: [pluginPath],
			rules: { "nextkit/t-no-positional-args": "error" },
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

describe("t-no-positional-args", () => {
	it("flags a positional placeholder", () => {
		const output = lint(`t("Results for {0}", { 0: query });`);
		expect(output).toContain("t-no-positional-args");
		expect(output).toContain("{0}");
	});

	it("flags every positional placeholder in a message", () => {
		const output = lint(`t("{0} of {1}", { 0: a, 1: b });`);
		expect(output.match(/t-no-positional-args/g)).toHaveLength(2);
	});

	it("accepts named placeholders", () => {
		expect(lint(`t("Results for {query}", { query });`)).toBe("");
	});

	it("does not read a plural's sub-message hash as positional", () => {
		expect(
			lint(`t("{count, plural, one {# item} other {# items}}", { count });`),
		).toBe("");
	});

	it("ignores digits inside embedded JSON", () => {
		expect(lint(`t('Config: {"a": 1}');`)).toBe("");
		expect(lint(`t('Rows: {2: "x"}');`)).toBe("");
	});

	it("ignores calls to functions other than the translator", () => {
		expect(lint(`format("Results for {0}");`)).toBe("");
	});
});
