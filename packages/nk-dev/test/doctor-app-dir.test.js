import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exitCodeFor, findings } from "../lib/doctor.js";

/**
 * Routes live in `src/app/`. Next also accepts a root `app/` and prefers it
 * when both exist, and every nk check and lint rule looks only in `src/app/`,
 * so a root `app/` is rejected outright.
 */
describe("nk doctor: routes live in src/app/", () => {
	let dir;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "nk-doctor-app-"));
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	const writePkg = (pkg) =>
		writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
	const write = (rel, content = "") => {
		const full = join(dir, rel);
		mkdirSync(dirname(full), { recursive: true });
		writeFileSync(full, content);
	};
	const appFindings = () =>
		findings(dir).filter((f) => f.id === "layout:root-app-dir");

	const NEXT_SITE = { name: "site", dependencies: { next: "^16.0.0" } };

	it("rejects a root app/ as an error with no autofix", () => {
		writePkg(NEXT_SITE);
		write("app/page.tsx");
		const [f, ...rest] = appFindings();
		expect(rest).toEqual([]);
		expect(f.level).toBe("error");
		expect(f.fix).toBeUndefined();
		expect(exitCodeFor(findings(dir))).toBe(1);
	});

	it("rejects a root app/ even when src/app/ also exists (Next serves app/)", () => {
		writePkg(NEXT_SITE);
		write("app/page.tsx");
		write("src/app/page.tsx");
		expect(appFindings()).toHaveLength(1);
	});

	it("catches next declared as a devDependency", () => {
		writePkg({ name: "site", devDependencies: { next: "^16.0.0" } });
		write("app/page.tsx");
		expect(appFindings()).toHaveLength(1);
	});

	it("accepts src/app/", () => {
		writePkg(NEXT_SITE);
		write("src/app/page.tsx");
		expect(appFindings()).toEqual([]);
	});

	it("leaves a package that is not a Next site alone", () => {
		writePkg({ name: "cli", dependencies: { commander: "^14.0.0" } });
		write("app/main.ts");
		expect(appFindings()).toEqual([]);
	});

	it("ignores a file named app", () => {
		writePkg(NEXT_SITE);
		write("app");
		expect(appFindings()).toEqual([]);
	});
});
