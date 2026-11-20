import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findings } from "../lib/doctor.js";

describe("nk doctor: the site's typescript is ^7", () => {
	let dir;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "nk-doctor-"));
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	const writePkg = (at, pkg) =>
		writeFileSync(
			join(at, "package.json"),
			JSON.stringify({ name: "site", ...pkg }),
		);
	const readPkg = () => JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
	const find = (at = dir) => findings(at).find((f) => f.id === "dep:typescript");
	const nkDev = { "@ingram-tech/nk-dev": "^0.26.0" };

	it.each([["^7"], ["^7.0.2"]])("accepts %s", (range) => {
		writePkg(dir, { devDependencies: { ...nkDev, typescript: range } });
		expect(find()).toBeUndefined();
	});

	it.each([
		["npm:@typescript/typescript6@^6.0.2"],
		["^6.0.2"],
		["^5.9.3"],
		["7.0.2"],
		["^70.0.0"],
	])("flags %s and sets ^7 on --fix", (range) => {
		writePkg(dir, { devDependencies: { ...nkDev, typescript: range } });
		const f = find();
		expect(f?.level).toBe("error");
		f.fix(dir);
		expect(readPkg().devDependencies.typescript).toBe("^7");
		expect(find()).toBeUndefined();
	});

	it("flags a missing typescript", () => {
		writePkg(dir, { devDependencies: nkDev });
		const f = find();
		expect(f?.level).toBe("error");
		f.fix(dir);
		expect(find()).toBeUndefined();
	});

	it("ignores a repo without nk-dev, and a Pulumi program", () => {
		writePkg(dir, { devDependencies: { typescript: "^5.9.3" } });
		expect(find()).toBeUndefined();
		writePkg(dir, {
			dependencies: { "@pulumi/pulumi": "^3.0.0" },
			devDependencies: { ...nkDev, typescript: "^5.9.3" },
		});
		expect(find()).toBeUndefined();
	});

	it("takes a member's typescript from its workspace root, and leaves a wrong root range to the root", () => {
		const web = join(dir, "apps", "web");
		mkdirSync(web, { recursive: true });
		writePkg(web, {});
		writePkg(dir, {
			workspaces: ["apps/*"],
			devDependencies: { ...nkDev, typescript: "^7.0.2" },
		});
		expect(find(web)).toBeUndefined();

		writePkg(dir, {
			workspaces: ["apps/*"],
			devDependencies: { ...nkDev, typescript: "^6.0.2" },
		});
		expect(find(web)?.fix).toBeUndefined();
		expect(find()?.fix).toBeDefined();
	});
});
