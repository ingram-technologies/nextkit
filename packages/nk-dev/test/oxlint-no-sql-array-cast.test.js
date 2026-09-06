import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const pluginPath = join(
	dirname(fileURLToPath(import.meta.url)),
	"../lib/oxlint-plugins/index.js",
);

const dirs = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

const lint = (source, filename = "fixture.ts") => {
	const dir = mkdtempSync(join(tmpdir(), "nk-oxlint-sql-array-"));
	dirs.push(dir);
	writeFileSync(
		join(dir, ".oxlintrc.json"),
		JSON.stringify({
			jsPlugins: [pluginPath],
			rules: { "nextkit/no-sql-array-cast": "error" },
		}),
	);
	writeFileSync(join(dir, filename), source);
	try {
		execFileSync("oxlint", ["-c", ".oxlintrc.json", filename], {
			cwd: dir,
			encoding: "utf8",
		});
		return "";
	} catch (error) {
		return String(error.stdout ?? "");
	}
};

/**
 * Drizzle expands an interpolated array into separate bound parameters, so the
 * cast lands on a record and Postgres refuses it at run time. Types and build
 * are both happy, which is why it needs a rule.
 */
describe("nextkit/no-sql-array-cast", () => {
	it("flags an array cast on an interpolation", () => {
		const out = lint("const q = sql`select ${ids}::uuid[]`;");
		expect(out).toContain("no-sql-array-cast");
		expect(out).toContain("uuid[]");
	});

	it("flags a quoted or schema-qualified type too", () => {
		const out = lint('const q = sql`select ${xs}::public."Kind"[]`;');
		expect(out).toContain("no-sql-array-cast");
	});

	it("allows a scalar cast", () => {
		expect(lint("const q = sql`select ${id}::uuid`;")).toBe("");
	});

	it("allows an array constructor", () => {
		expect(lint("const q = sql`select array[${sql.join(parts)}]::uuid[]`;")).toBe(
			"",
		);
	});

	it("leaves other tagged templates alone", () => {
		expect(lint("const q = gql`select ${ids}::uuid[]`;")).toBe("");
	});
});
