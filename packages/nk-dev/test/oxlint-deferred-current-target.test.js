import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import plugin from "../lib/oxlint-plugins/index.js";

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

// End-to-end through the real oxlint binary: validates the jsPlugins wiring,
// visitor names (incl. :exit), and traversal — not just the rule's logic.
const lint = (source) => {
	const dir = mkdtempSync(join(tmpdir(), "nk-oxlint-dct-"));
	dirs.push(dir);
	writeFileSync(
		join(dir, ".oxlintrc.json"),
		JSON.stringify({
			jsPlugins: [pluginPath],
			rules: { "nextkit/no-deferred-current-target": "error" },
		}),
	);
	writeFileSync(join(dir, "fixture.tsx"), source);
	try {
		execFileSync("oxlint", ["-c", ".oxlintrc.json", "fixture.tsx"], {
			cwd: dir,
			encoding: "utf8",
		});
		return "";
	} catch (error) {
		return String(error.stdout ?? "");
	}
};

describe("no-deferred-current-target", () => {
	it("is exported by the combined nextkit plugin alongside the base-ui rule", () => {
		expect(Object.keys(plugin.rules)).toEqual(
			expect.arrayContaining([
				"no-deferred-current-target",
				"no-radix-props-on-base-ui",
			]),
		);
	});

	it("flags a read inside a setState updater", () => {
		const out = lint(`
			export const f = (set) => (event) =>
				set((current) => ({ ...current, name: event.currentTarget.value }));
		`);
		expect(out).toContain("no-deferred-current-target");
	});

	it("flags a read inside a setTimeout callback", () => {
		const out = lint(`
			export const f = (event) => {
				setTimeout(() => console.log(event.currentTarget.textContent), 100);
			};
		`);
		expect(out).toContain("no-deferred-current-target");
	});

	it("does not flag a synchronous read in the handler body", () => {
		const out = lint(`
			export const f = (set) => (event) => {
				const name = event.currentTarget.value;
				set((current) => ({ ...current, name }));
			};
		`);
		expect(out).toBe("");
	});

	it("does not flag a callback param that shadows the handler's event", () => {
		const out = lint(`
			export const f = (on) => (event) => {
				on((event) => event.currentTarget.value);
			};
		`);
		expect(out).toBe("");
	});

	it("does not flag a local declared inside the callback", () => {
		const out = lint(`
			export const f = (event) => {
				setTimeout(() => {
					const event = getSyntheticEvent();
					console.log(event.currentTarget);
				}, 100);
			};
		`);
		expect(out).toBe("");
	});
});
