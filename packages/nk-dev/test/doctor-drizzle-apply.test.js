import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findings } from "../lib/doctor.js";

/**
 * drizzle-kit is generate-only across the fleet: `push` applies schema to the
 * live DB with no migration (the drift source) and `migrate` is opaque.
 * `nk-pg-migrate` is the one runner that applies.
 */
describe("nk doctor: drizzle-kit must never apply schema", () => {
	let dir;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "nk-doctor-"));
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	const writePkg = (scripts) =>
		writeFileSync(
			join(dir, "package.json"),
			JSON.stringify({ name: "site", scripts }),
		);
	const readPkg = () => JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
	const find = (id) => findings(dir).find((f) => f.id === id);

	it("flags `drizzle-kit push` as an error and removes the script on --fix", () => {
		writePkg({ "db:push": "drizzle-kit push" });
		const f = find("script:drizzle-push:db:push");
		expect(f).toBeDefined();
		expect(f.level).toBe("error");
		expect(f.message).toMatch(/no migration/);

		f.fix(dir);
		expect(readPkg().scripts["db:push"]).toBeUndefined();
	});

	it("flags `drizzle-kit migrate` and rewrites it to nk-pg-migrate on --fix", () => {
		writePkg({ "db:migrate": "drizzle-kit migrate" });
		const f = find("script:drizzle-migrate:db:migrate");
		expect(f).toBeDefined();
		expect(f.level).toBe("error");

		f.fix(dir);
		expect(readPkg().scripts["db:migrate"]).toBe("nk-pg-migrate");
	});

	it("leaves `drizzle-kit generate` alone — generating is the supported use", () => {
		writePkg({ "db:generate": "drizzle-kit generate" });
		const ids = findings(dir).map((f) => f.id);
		expect(ids.some((id) => id.startsWith("script:drizzle-"))).toBe(false);
	});

	it("accepts nk-pg-migrate as the apply path", () => {
		writePkg({
			"db:migrate": "nk-pg-migrate",
			"db:migrate:status": "nk-pg-migrate --status",
		});
		const ids = findings(dir).map((f) => f.id);
		expect(ids.some((id) => id.startsWith("script:drizzle-"))).toBe(false);
	});

	it("catches the command under any script name and with extra flags", () => {
		writePkg({ shipit: "bun run build && drizzle-kit push --force" });
		expect(find("script:drizzle-push:shipit")).toBeDefined();
	});
});
