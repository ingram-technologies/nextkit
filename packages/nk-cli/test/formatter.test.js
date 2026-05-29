import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveFormatter } from "../lib/formatter.js";

// These guard the prime-directive carve-out: nk must only orchestrate standard
// tools. If a command ever resolved to something other than a plain Biome
// invocation, that's an interception and these tests should fail.
describe("resolveFormatter", () => {
	let dir;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "nk-"));
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it("defaults to biome, mapping each op to a standard biome invocation", () => {
		writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "site" }));
		const f = resolveFormatter(dir);
		expect(f.name).toBe("biome");
		expect(f.lint).toEqual(["biome", ["lint", "."]]);
		expect(f.check).toEqual(["biome", ["check", "."]]);
		expect(f.write).toEqual(["biome", ["format", "--write", "."]]);
		expect(f.checkFormat).toEqual(["biome", ["format", "."]]);
	});

	it("honors a configured oxc formatter (code formatting disabled until GA)", () => {
		writeFileSync(
			join(dir, "package.json"),
			JSON.stringify({ nk: { formatter: "oxc" } }),
		);
		const f = resolveFormatter(dir);
		expect(f.name).toBe("oxc");
		expect(f.write).toBeNull();
		expect(f.checkFormat).toBeNull();
		expect(f.lint).toEqual(["oxlint", []]);
	});
});
