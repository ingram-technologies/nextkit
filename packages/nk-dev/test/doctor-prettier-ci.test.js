import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findings } from "../lib/doctor.js";

describe("nk doctor: Prettier leftovers and the ci script", () => {
	let dir;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "nk-doctor-"));
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	const writePkg = (extra) =>
		writeFileSync(
			join(dir, "package.json"),
			JSON.stringify({ name: "site", scripts: {}, ...extra }),
		);
	const readPkg = () => JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
	const find = (id) => findings(dir).find((f) => f.id === id);

	it("flags a `prettier` key in package.json and deletes it on --fix", () => {
		writePkg({ prettier: { semi: false } });
		const f = find("prettier:package.json");
		expect(f?.level).toBe("warn");
		f.fix(dir);
		expect(readPkg().prettier).toBeUndefined();
		expect(find("prettier:package.json")).toBeUndefined();
	});

	it("flags .prettierrc* and .prettierignore files and removes them on --fix", () => {
		writePkg({});
		writeFileSync(join(dir, ".prettierrc.json"), "{}");
		writeFileSync(join(dir, ".prettierignore"), "*.sql\n");
		const rc = find("prettier:.prettierrc.json");
		const ignore = find("prettier:.prettierignore");
		expect(rc?.level).toBe("warn");
		expect(ignore?.level).toBe("warn");
		rc.fix(dir);
		ignore.fix(dir);
		expect(existsSync(join(dir, ".prettierrc.json"))).toBe(false);
		expect(existsSync(join(dir, ".prettierignore"))).toBe(false);
	});

	it("warns when the ci script is missing, and does not offer a fix", () => {
		writePkg({});
		const f = find("script:ci");
		expect(f?.level).toBe("warn");
		expect(f.fix).toBeUndefined();
	});

	it("warns when ci skips the type-check", () => {
		writePkg({ scripts: { ci: "nk check && vitest run" } });
		expect(find("script:ci")?.message).toContain("nk type-check");
	});

	it("accepts ci that runs the gate directly or through scripts", () => {
		writePkg({ scripts: { ci: "nk check && nk type-check && vitest run" } });
		expect(find("script:ci")).toBeUndefined();
		writePkg({ scripts: { ci: "bun run type-check && bun run check" } });
		expect(find("script:ci")).toBeUndefined();
	});
});
