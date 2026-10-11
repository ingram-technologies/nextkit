import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findings } from "../lib/doctor.js";

describe("nk doctor: a Bun/npm workspace", () => {
	let root;
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "nk-doctor-monorepo-"));
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	const pkg = (dir, json) => {
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "package.json"), JSON.stringify(json));
	};
	const ids = (dir) => findings(dir).map((f) => f.id);
	const rootPkg = (scripts, extra = {}) =>
		pkg(root, {
			name: "mono",
			workspaces: ["apps/*", "packages/ui"],
			devDependencies: { "@ingram-tech/nk-dev": "^0.19.0" },
			scripts: {
				lint: "nk lint",
				format: "nk format",
				check: "nk check",
				...scripts,
			},
			...extra,
		});

	it.each([
		"bun --filter '*' type-check",
		"bun run --filter=* type-check",
		"pnpm -r type-check",
		"npm run type-check --workspaces",
		"turbo run type-check",
	])("accepts a root type-check that fans out: %s", (cmd) => {
		rootPkg({ "type-check": cmd, ci: "bun --filter '*' ci && knip" });
		expect(ids(root)).not.toContain("script:type-check");
		expect(ids(root)).not.toContain("script:ci");
	});

	it("still flags a root type-check that neither runs nk nor fans out", () => {
		rootPkg({ "type-check": "tsc --noEmit", ci: "bun run check" });
		expect(ids(root)).toContain("script:type-check");
		expect(ids(root)).toContain("script:ci");
	});

	it("does not accept fan-out flags outside a workspace root", () => {
		pkg(root, {
			name: "site",
			devDependencies: { "@ingram-tech/nk-dev": "^0.19.0" },
			scripts: { "type-check": "bun --filter '*' type-check" },
		});
		expect(ids(root)).toContain("script:type-check");
	});

	it("lets a member inherit nk-dev from the root, but still flags superseded deps", () => {
		rootPkg({ "type-check": "bun --filter '*' type-check" });
		const web = join(root, "apps", "web");
		pkg(web, {
			name: "web",
			devDependencies: { "@ingram-tech/oxlint-config": "1" },
		});
		expect(ids(web)).not.toContain("dep:nk-dev-missing");
		expect(ids(web)).toContain("dep:@ingram-tech/oxlint-config");
		const ui = join(root, "packages", "ui");
		pkg(ui, { name: "ui" });
		expect(ids(ui)).not.toContain("dep:nk-dev-missing");
	});

	it("leaves lint/format to the root and lets a library type-check with tsc", () => {
		rootPkg({ "type-check": "bun --filter '*' type-check" });
		const ui = join(root, "packages", "ui");
		pkg(ui, {
			name: "ui",
			scripts: {
				check: "nk check",
				"type-check": "tsc --noEmit",
				ci: "nk check && tsc --noEmit",
			},
		});
		expect(ids(ui)).toEqual([]);
	});

	it("still wants nk type-check in a Next app member", () => {
		rootPkg({ "type-check": "bun --filter '*' type-check" });
		const web = join(root, "apps", "web");
		pkg(web, {
			name: "web",
			scripts: {
				check: "nk check",
				"type-check": "tsc --noEmit",
				ci: "nk check && tsc --noEmit",
			},
		});
		writeFileSync(join(web, "next.config.ts"), "export default {};");
		expect(ids(web)).toEqual(
			expect.arrayContaining(["script:type-check", "script:ci"]),
		);
		expect(ids(web)).not.toContain("script:lint");
	});

	it("wants lint/format in a member whose root does not run them", () => {
		pkg(root, { name: "mono", workspaces: ["apps/*"] });
		const web = join(root, "apps", "web");
		pkg(web, { name: "web", scripts: {} });
		expect(ids(web)).toEqual(
			expect.arrayContaining(["script:lint", "script:format"]),
		);
	});

	it("still warns for a nested package the workspace does not list", () => {
		rootPkg({ "type-check": "bun --filter '*' type-check" });
		const stray = join(root, "packages", "other");
		pkg(stray, { name: "other" });
		expect(ids(stray)).toContain("dep:nk-dev-missing");
	});
});
