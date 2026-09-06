import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

const lint = (source, file = "app/api/invoices/route.ts") => {
	const dir = mkdtempSync(join(tmpdir(), "nk-oxlint-body-"));
	dirs.push(dir);
	writeFileSync(
		join(dir, ".oxlintrc.json"),
		JSON.stringify({
			jsPlugins: [pluginPath],
			rules: { "nextkit/no-unvalidated-request-body": "error" },
		}),
	);
	mkdirSync(join(dir, dirname(file)), { recursive: true });
	writeFileSync(join(dir, file), source);
	try {
		execFileSync("oxlint", ["-c", ".oxlintrc.json", file], {
			cwd: dir,
			encoding: "utf8",
		});
		return "";
	} catch (error) {
		return String(error.stdout ?? "");
	}
};

/**
 * `json()` is typed `any`, so a cast on the parsed body asserts a shape the
 * caller controls and nothing verifies. The nextkit hard rule is to parse it
 * with Zod; this catches the two ways around that which still type-check.
 */
describe("nextkit/no-unvalidated-request-body", () => {
	it("flags a cast on the parsed body", () => {
		const out = lint(
			"export async function POST(req: Request) {\n" +
				"\tconst body = (await req.json()) as { total: number };\n" +
				"\treturn Response.json(body);\n" +
				"}",
		);
		expect(out).toContain("no-unvalidated-request-body");
	});

	it("flags a type annotation doing the same work", () => {
		const out = lint(
			"export async function POST(req: Request) {\n" +
				"\tconst body: { total: number } = await req.json();\n" +
				"\treturn Response.json(body);\n" +
				"}",
		);
		expect(out).toContain("no-unvalidated-request-body");
	});

	it("flags an as-unknown-as launder", () => {
		const out = lint(
			"export async function POST(req: Request) {\n" +
				"\tconst body = (await req.json()) as unknown as { total: number };\n" +
				"\treturn Response.json(body);\n" +
				"}",
		);
		expect(out).toContain("no-unvalidated-request-body");
	});

	it("allows parsing with a schema", () => {
		const out = lint(
			"export async function POST(req: Request) {\n" +
				"\tconst body = schema.parse(await req.json());\n" +
				"\treturn Response.json(body);\n" +
				"}",
		);
		expect(out).toBe("");
	});

	it("allows casting to unknown on the way into a parser", () => {
		const out = lint(
			"export async function POST(req: Request) {\n" +
				"\tconst raw = (await req.json()) as unknown;\n" +
				"\treturn Response.json(schema.parse(raw));\n" +
				"}",
		);
		expect(out).toBe("");
	});

	it("says nothing about a response body outside a route", () => {
		const out = lint(
			"export const load = async () => {\n" +
				"\tconst res = await fetch('/x');\n" +
				"\treturn (await res.json()) as { total: number };\n" +
				"};",
			"src/lib/client.ts",
		);
		expect(out).toBe("");
	});
});
