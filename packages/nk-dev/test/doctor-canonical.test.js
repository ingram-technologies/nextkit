import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exitCodeFor, findings } from "../lib/doctor.js";

const NK_DEV = { "@ingram-tech/nk-dev": "^0.19.0" };
const CANONICAL = {
	lint: "nk lint",
	format: "nk format",
	check: "nk check",
	"type-check": "nk type-check",
};

/** The canonical scripts without `key`. */
const without = (key) =>
	Object.fromEntries(Object.entries(CANONICAL).filter(([k]) => k !== key));

let dir;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "nk-doctor-canonical-"));
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

const writeJson = (name, value) =>
	writeFileSync(join(dir, name), JSON.stringify(value, null, "\t"));
const readJson = (name) => JSON.parse(readFileSync(join(dir, name), "utf8"));
const ids = () => findings(dir).map((f) => f.id);
const find = (id) => findings(dir).find((f) => f.id === id);

describe("nk doctor: canonical scripts", () => {
	it("accepts the canonical scripts", () => {
		writeJson("package.json", { scripts: CANONICAL, devDependencies: NK_DEV });
		expect(
			ids().filter((id) => id.startsWith("script:") && id !== "script:ci"),
		).toEqual([]);
	});

	it("flags a missing or wrong script, and --fix writes the canonical command", () => {
		writeJson("package.json", {
			scripts: { ...without("lint"), format: "oxfmt --write ." },
			devDependencies: NK_DEV,
		});
		for (const id of ["script:lint", "script:format"]) {
			const f = find(id);
			expect(f?.level).toBe("error");
			f.fix(dir);
		}
		expect(readJson("package.json").scripts).toMatchObject(CANONICAL);
		expect(find("script:lint")).toBeUndefined();
		expect(find("script:format")).toBeUndefined();
	});

	it("accepts `typecheck` in place of `type-check`", () => {
		writeJson("package.json", {
			scripts: { ...without("type-check"), typecheck: "nk type-check" },
			devDependencies: NK_DEV,
		});
		expect(ids().some((id) => id.startsWith("script:type"))).toBe(false);
	});

	it("fixes a wrong `typecheck` in place rather than adding `type-check`", () => {
		writeJson("package.json", {
			scripts: { ...without("type-check"), typecheck: "tsc --noEmit" },
			devDependencies: NK_DEV,
		});
		find("script:typecheck").fix(dir);
		const { scripts } = readJson("package.json");
		expect(scripts.typecheck).toBe("nk type-check");
		expect(scripts["type-check"]).toBeUndefined();
	});

	// When both keys exist, `type-check` is the one the model reads, so a
	// correct `typecheck` does not excuse a wrong `type-check`.
	it("judges `type-check` when both keys are present", () => {
		writeJson("package.json", {
			scripts: { ...CANONICAL, "type-check": "tsc", typecheck: "nk type-check" },
			devDependencies: NK_DEV,
		});
		expect(ids()).toContain("script:type-check");
		expect(ids()).not.toContain("script:typecheck");
	});
});

describe("nk doctor: superseded dependencies", () => {
	it("flags each superseded dep and --fix removes it from deps and devDeps", () => {
		writeJson("package.json", {
			scripts: CANONICAL,
			dependencies: { prettier: "^3.0.0", next: "16.0.0" },
			devDependencies: { ...NK_DEV, oxlint: "^1.0.0" },
		});
		const prettier = find("dep:prettier");
		const oxlint = find("dep:oxlint");
		expect(prettier?.level).toBe("error");
		expect(oxlint?.level).toBe("error");
		prettier.fix(dir);
		oxlint.fix(dir);

		const pkg = readJson("package.json");
		expect(pkg.dependencies).toEqual({ next: "16.0.0" });
		expect(pkg.devDependencies).toEqual(NK_DEV);
	});

	it("warns, with no autofix, when nk-dev itself is missing", () => {
		writeJson("package.json", {
			scripts: CANONICAL,
			devDependencies: { oxlint: "1" },
		});
		const f = find("dep:nk-dev-missing");
		expect(f?.level).toBe("warn");
		expect(f.fix).toBeUndefined();
		// Without nk-dev there is no toolchain to have superseded anything.
		expect(find("dep:oxlint")).toBeUndefined();
	});
});

describe("nk doctor: tsconfig extends", () => {
	beforeEach(() => {
		writeJson("package.json", { scripts: CANONICAL, devDependencies: NK_DEV });
	});

	it("repoints a retired typescript-config extends and keeps the rest", () => {
		writeJson("tsconfig.json", {
			extends: "@ingram-tech/typescript-config/nextjs.json",
			include: ["src"],
		});
		const f = find("tsconfig:extends");
		expect(f?.level).toBe("error");
		f.fix(dir);
		expect(readJson("tsconfig.json")).toEqual({
			extends: "@ingram-tech/nk-dev/tsconfig/nextjs.json",
			include: ["src"],
		});
		expect(find("tsconfig:extends")).toBeUndefined();
	});

	it("leaves any other extends alone", () => {
		writeJson("tsconfig.json", { extends: "./tsconfig.base.json" });
		expect(find("tsconfig:extends")).toBeUndefined();
	});
});

describe("nk doctor: stale knip ignores", () => {
	beforeEach(() => {
		writeJson("package.json", { scripts: CANONICAL, devDependencies: NK_DEV });
	});

	it("warns on superseded names and --fix prunes only those", () => {
		writeJson("knip.json", {
			ignoreDependencies: ["prettier", "sharp", "@ingram-tech/nk-cli"],
		});
		const f = find("knip:stale-ignores");
		expect(f?.level).toBe("warn");
		f.fix(dir);
		expect(readJson("knip.json").ignoreDependencies).toEqual(["sharp"]);
		expect(find("knip:stale-ignores")).toBeUndefined();
	});

	it("is silent when no ignore is superseded", () => {
		writeJson("knip.json", { ignoreDependencies: ["sharp"] });
		expect(find("knip:stale-ignores")).toBeUndefined();
	});
});

describe("exitCodeFor", () => {
	it("fails when any finding is an error", () => {
		expect(exitCodeFor([{ level: "warn" }, { level: "error" }])).toBe(1);
	});

	it("passes when there are only warnings", () => {
		expect(exitCodeFor([{ level: "warn" }, { level: "warn" }])).toBe(0);
	});
});
