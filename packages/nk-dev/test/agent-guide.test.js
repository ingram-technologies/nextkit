import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkAgentGuideImport } from "../lib/agent-guide.js";

const IMPORT_LINE = "@./node_modules/@ingram-tech/nk-dev/guide.md";

describe("checkAgentGuideImport", () => {
	let dir;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "nk-"));
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	const writePkg = (where, deps) =>
		writeFileSync(join(where, "package.json"), JSON.stringify(deps));

	it("is ok when there is no package.json", () => {
		expect(checkAgentGuideImport(dir).ok).toBe(true);
	});

	it("is ok when agent-guide is not a dependency", () => {
		writePkg(dir, { dependencies: { next: "16" } });
		expect(checkAgentGuideImport(dir).ok).toBe(true);
	});

	it("is ok when the dep is present and CLAUDE.md imports the guide", () => {
		writePkg(dir, { dependencies: { "@ingram-tech/nk-dev": "^0.1.1" } });
		writeFileSync(join(dir, "CLAUDE.md"), `# Site\n\n${IMPORT_LINE}\n`);
		expect(checkAgentGuideImport(dir).ok).toBe(true);
	});

	it("enforces on a devDependency too", () => {
		writePkg(dir, { devDependencies: { "@ingram-tech/nk-dev": "^0.1.1" } });
		writeFileSync(join(dir, "CLAUDE.md"), `# Site\n\n${IMPORT_LINE}\n`);
		expect(checkAgentGuideImport(dir).ok).toBe(true);
	});

	it("fails when the dep is present but there is no CLAUDE.md", () => {
		writePkg(dir, { dependencies: { "@ingram-tech/nk-dev": "^0.1.1" } });
		const res = checkAgentGuideImport(dir);
		expect(res.ok).toBe(false);
		expect(res.reason).toMatch(/no CLAUDE\.md/);
	});

	it("fails when CLAUDE.md exists but lacks the import", () => {
		writePkg(dir, { dependencies: { "@ingram-tech/nk-dev": "^0.1.1" } });
		writeFileSync(join(dir, "CLAUDE.md"), "# Site\n\nNo import here.\n");
		const res = checkAgentGuideImport(dir);
		expect(res.ok).toBe(false);
		expect(res.reason).toMatch(/does not @import/);
	});

	it("finds CLAUDE.md one level up for an app nested in a subdir", () => {
		// repo root holds CLAUDE.md; the Next app (with the dep) lives in web/.
		writeFileSync(
			join(dir, "CLAUDE.md"),
			`# Monorepo\n\n@./web/node_modules/@ingram-tech/nk-dev/guide.md\n`,
		);
		const app = join(dir, "web");
		mkdirSync(app);
		writePkg(app, { dependencies: { "@ingram-tech/nk-dev": "^0.1.1" } });
		expect(checkAgentGuideImport(app).ok).toBe(true);
	});
});
