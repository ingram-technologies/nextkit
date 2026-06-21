import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hasKnipConfig } from "../lib/knip.js";

describe("hasKnipConfig", () => {
	let dir;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "nk-knip-"));
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	const writePkg = (obj) =>
		writeFileSync(join(dir, "package.json"), JSON.stringify(obj));

	it("is false with no config and no package.json", () => {
		expect(hasKnipConfig(dir)).toBe(false);
	});

	it("is false when package.json has no knip key", () => {
		writePkg({ name: "x" });
		expect(hasKnipConfig(dir)).toBe(false);
	});

	it("detects a knip.json file", () => {
		writeFileSync(join(dir, "knip.json"), "{}");
		expect(hasKnipConfig(dir)).toBe(true);
	});

	it("detects a knip.ts file", () => {
		writeFileSync(join(dir, "knip.ts"), "export default {};");
		expect(hasKnipConfig(dir)).toBe(true);
	});

	it("detects a package.json#knip key", () => {
		writePkg({ name: "x", knip: { ignoreDependencies: ["a"] } });
		expect(hasKnipConfig(dir)).toBe(true);
	});
});
