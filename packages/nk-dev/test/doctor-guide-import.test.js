import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findings } from "../lib/doctor.js";

const IMPORT_LINE = "@./node_modules/@ingram-tech/nk-dev/guide.md";

describe("nk doctor: the guide import in a workspace member", () => {
	let root;
	let member;
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "nk-doctor-guide-"));
		mkdirSync(join(root, ".git"));
		member = join(root, "api");
		mkdirSync(member);
		writeFileSync(
			join(member, "package.json"),
			JSON.stringify({ devDependencies: { "@ingram-tech/nk-dev": "^0.19.0" } }),
		);
		writeFileSync(join(member, "CLAUDE.md"), "# API rules\n");
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	const find = (dir) => findings(dir).find((f) => f.id === "claude:guide-import");

	it("reports nothing when the workspace root imports the guide", () => {
		writeFileSync(join(root, "CLAUDE.md"), `# Monorepo\n\n${IMPORT_LINE}\n`);
		expect(find(member)).toBeUndefined();
	});

	it("reports a member no CLAUDE.md covers, and --fix adds the import once", () => {
		const finding = find(member);
		expect(finding?.level).toBe("error");
		finding.fix(member);
		finding.fix(member);
		const body = readFileSync(join(member, "CLAUDE.md"), "utf8");
		expect(body.split(IMPORT_LINE).length - 1).toBe(1);
		expect(find(member)).toBeUndefined();
	});
});
