import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveFormatter } from "../lib/formatter.js";

// These guard the prime-directive carve-out: nk must only orchestrate standard
// tools. If a command ever resolved to something other than a plain oxlint/oxfmt
// (or biome) invocation, that's an interception and these tests should fail.
describe("resolveFormatter", () => {
	let dir;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "nk-"));
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it("defaults to oxc, mapping each op to a standard oxlint/oxfmt invocation", () => {
		writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "site" }));
		const f = resolveFormatter(dir);
		expect(f.name).toBe("oxc");
		expect(f.lint).toEqual(["oxlint", []]);
		expect(f.write).toEqual(["oxfmt", ["--write", "."]]);
		expect(f.checkFormat).toEqual(["oxfmt", ["--check", "."]]);
	});

	it("honors a configured biome formatter (the fallback for unmigrated sites)", () => {
		writeFileSync(
			join(dir, "package.json"),
			JSON.stringify({ nk: { formatter: "biome" } }),
		);
		const f = resolveFormatter(dir);
		expect(f.name).toBe("biome");
		expect(f.lint).toEqual(["biome", ["lint", "."]]);
		expect(f.write).toEqual(["biome", ["format", "--write", "."]]);
		expect(f.checkFormat).toEqual(["biome", ["format", "."]]);
	});
});
