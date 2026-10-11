import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import plugin from "../lib/oxlint-plugins/index.js";
import { lint } from "./oxlint-harness.js";

const pluginDir = join(
	dirname(fileURLToPath(import.meta.url)),
	"../lib/oxlint-plugins",
);

// Shared helpers, not rule modules: they export functions, not a plugin.
const NOT_RULE_MODULES = new Set([
	"index.js",
	"icu-arguments.js",
	"base-ui-project.js",
]);

const ruleModules = readdirSync(pluginDir).filter(
	(file) => file.endsWith(".js") && !NOT_RULE_MODULES.has(file),
);

describe("the combined nextkit oxlint plugin", () => {
	it.each(ruleModules)("merges every rule %s exports", async (file) => {
		const { default: module } = await import(join(pluginDir, file));
		const names = Object.keys(module?.rules ?? {});
		expect(names.length).toBeGreaterThan(0);
		for (const name of names) {
			expect(plugin.rules[name]).toBe(module.rules[name]);
		}
	});

	it("exports no rule twice and nothing beyond the rule modules", async () => {
		// A later module reusing a rule name would silently replace the earlier
		// rule in the spread; the counts only match when every name is unique.
		let total = 0;
		for (const file of ruleModules) {
			const { default: module } = await import(join(pluginDir, file));
			total += Object.keys(module.rules).length;
		}
		expect(Object.keys(plugin.rules)).toHaveLength(total);
	});
});

describe("the oxlint test harness", () => {
	it("throws when the oxlint binary is missing instead of reporting nothing", () => {
		const path = process.env.PATH;
		process.env.PATH = "/nonexistent";
		try {
			expect(() => lint("t-requires-values", `t("{query}");`)).toThrow(/ENOENT/);
		} finally {
			process.env.PATH = path;
		}
	});
});
