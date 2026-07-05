import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { fsSource } from "./fs.js";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "nk-blog-"));
afterAll(() => fs.rm(tmp, { recursive: true, force: true }));

describe("fsSource", () => {
	it("returns [] for a missing directory", async () => {
		expect(await fsSource(path.join(tmp, "nope")).load()).toEqual([]);
	});

	it("lists flat files and folder posts, ignoring everything else", async () => {
		await fs.writeFile(path.join(tmp, "a.md"), "A");
		await fs.writeFile(path.join(tmp, "b.mdx"), "B");
		await fs.writeFile(path.join(tmp, "notes.txt"), "no");
		await fs.mkdir(path.join(tmp, "c"));
		await fs.writeFile(path.join(tmp, "c", "index.mdx"), "C");
		await fs.writeFile(path.join(tmp, "c", "components.tsx"), "no");
		await fs.mkdir(path.join(tmp, "empty"));

		const files = await fsSource(tmp).load();
		expect(files.map((f) => f.name).sort()).toEqual([
			"a.md",
			"b.mdx",
			"c/index.mdx",
		]);
		expect(files.find((f) => f.name === "c/index.mdx")?.content).toBe("C");
	});
});
