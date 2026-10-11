// Shared harness for the nextkit oxlint plugin tests: every rule is exercised
// end-to-end through the real oxlint binary, which validates the jsPlugins
// wiring, visitor names (incl. `:exit`) and traversal, not just rule logic.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach } from "vitest";

export const pluginPath = join(
	dirname(fileURLToPath(import.meta.url)),
	"../lib/oxlint-plugins/index.js",
);

const dirs = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

/**
 * Writes `source` to `filename` in a fresh project with only `nextkit/<rule>`
 * enabled (oxlint's default categories off, so a built-in rule can never leak
 * into an assertion), plus an optional `package.json`.
 */
const setup = (rule, source, { filename = "fixture.ts", packageJson } = {}) => {
	const dir = mkdtempSync(join(tmpdir(), `nk-oxlint-${rule}-`));
	dirs.push(dir);
	writeFileSync(
		join(dir, ".oxlintrc.json"),
		JSON.stringify({
			jsPlugins: [pluginPath],
			categories: { correctness: "off" },
			rules: { [`nextkit/${rule}`]: "error" },
		}),
	);
	if (packageJson) {
		writeFileSync(join(dir, "package.json"), JSON.stringify(packageJson));
	}
	const file = join(dir, filename);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, source);
	return { dir, file };
};

/**
 * Runs oxlint and returns its stdout. Throws on anything other than a clean
 * run (exit 0) or a run that found problems (exit 1): a missing binary or a
 * plugin that fails to load must fail the test, never read as "no findings".
 */
const runOxlint = (dir, args) => {
	const result = spawnSync("oxlint", ["-c", ".oxlintrc.json", ...args], {
		cwd: dir,
		encoding: "utf8",
	});
	if (result.error) throw result.error;
	if (result.status !== 0 && result.status !== 1) {
		throw new Error(
			`oxlint exited ${result.status}:\n${result.stderr}\n${result.stdout}`,
		);
	}
	return result.stdout;
};

/**
 * Lints one fixture with `nextkit/<rule>` and returns its diagnostics.
 *
 * @param {string} rule the rule id without the `nextkit/` prefix
 * @param {string} source
 * @param {{ filename?: string, packageJson?: object }} [options]
 * @returns {{ rule: string, message: string, line: number, column: number }[]}
 */
export const lint = (rule, source, options) => {
	const { dir, file } = setup(rule, source, options);
	const out = JSON.parse(
		runOxlint(dir, ["--format", "json", file.slice(dir.length + 1)]),
	);
	return out.diagnostics.map((diagnostic) => ({
		// `nextkit(rule-id)` -> `nextkit/rule-id`, the id used in config. A
		// parse error has no code; it stays in the list so it fails the test.
		rule: diagnostic.code?.replace(/^(.+)\((.+)\)$/, "$1/$2") ?? "parse-error",
		message: diagnostic.message,
		line: diagnostic.labels[0]?.span.line,
		column: diagnostic.labels[0]?.span.column,
	}));
};

/** Runs `oxlint --fix` with `nextkit/<rule>` and returns the rewritten file. */
export const fix = (rule, source, options) => {
	const { dir, file } = setup(rule, source, options);
	runOxlint(dir, ["--fix", file.slice(dir.length + 1)]);
	return readFileSync(file, "utf8");
};

/** The rule ids of a diagnostics list, for asserting what fired and how often. */
export const ruleIds = (diagnostics) => diagnostics.map((d) => d.rule);
