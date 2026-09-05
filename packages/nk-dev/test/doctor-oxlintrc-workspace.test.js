import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findings } from "../lib/doctor.js";

const NK_DEV_OXLINTRC = "node_modules/@ingram-tech/nk-dev/oxlintrc.json";

describe("nk doctor: .oxlintrc.json extends in a hoisted workspace", () => {
	let root;
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "nk-doctor-ws-"));
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	// A site folder with package.json + .oxlintrc.json; nk-dev's oxlintrc is
	// installed under `installRoot` (the site itself, or the workspace root).
	const site = (dir, installRoot, extendsEntries) => {
		mkdirSync(dir, { recursive: true });
		mkdirSync(join(installRoot, "node_modules/@ingram-tech/nk-dev"), {
			recursive: true,
		});
		writeFileSync(join(installRoot, NK_DEV_OXLINTRC), "{}");
		writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "site" }));
		writeFileSync(
			join(dir, ".oxlintrc.json"),
			JSON.stringify({ extends: extendsEntries }),
		);
	};
	const extendsOf = (dir) =>
		JSON.parse(readFileSync(join(dir, ".oxlintrc.json"), "utf8")).extends;
	const find = (dir) => findings(dir).find((f) => f.id === "oxlintrc:extends");

	it("accepts ../node_modules/… when node_modules is hoisted to the workspace root", () => {
		const dir = join(root, "site");
		site(dir, root, [`../${NK_DEV_OXLINTRC}`]);
		expect(find(dir)).toBeUndefined();
	});

	it("still accepts ./node_modules/… in a standalone site", () => {
		site(root, root, [`./${NK_DEV_OXLINTRC}`]);
		expect(find(root)).toBeUndefined();
	});

	it("--fix points a workspace member at the path that actually resolves", () => {
		const dir = join(root, "site");
		site(dir, root, ["@ingram-tech/oxlint-config"]);
		const f = find(dir);
		expect(f?.level).toBe("error");
		f.fix(dir);
		expect(extendsOf(dir)).toEqual([`../${NK_DEV_OXLINTRC}`]);
		expect(find(dir)).toBeUndefined();
	});

	it("--fix keeps the ./ form for a standalone site and drops the retired config", () => {
		site(root, root, ["@ingram-tech/oxlint-config", "./tier-b.json"]);
		find(root).fix(root);
		expect(extendsOf(root)).toEqual([`./${NK_DEV_OXLINTRC}`, "./tier-b.json"]);
	});
});
