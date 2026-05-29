import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readNkConfig } from "../lib/config.js";

describe("readNkConfig", () => {
	let dir;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "nk-"));
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it("returns the nk block when present", () => {
		writeFileSync(
			join(dir, "package.json"),
			JSON.stringify({ nk: { formatter: "oxc" } }),
		);
		expect(readNkConfig(dir)).toEqual({ formatter: "oxc" });
	});

	it("returns {} when there is no nk block", () => {
		writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "site" }));
		expect(readNkConfig(dir)).toEqual({});
	});

	it("returns {} when package.json is missing or unreadable", () => {
		expect(readNkConfig(join(dir, "does-not-exist"))).toEqual({});
	});
});
