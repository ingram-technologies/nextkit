import { describe, expect, it } from "vitest";
import { lint as lintRule, ruleIds } from "./oxlint-harness.js";

const RULE = "nextkit/no-unvalidated-request-body";

/** Lints a POST handler whose body is `lines`, as a route file by default. */
const lintHandler = (lines, filename = "app/api/invoices/route.ts") =>
	lintRule(
		"no-unvalidated-request-body",
		[
			"export async function POST(req: Request) {",
			...lines.map((line) => `\t${line}`),
			"}",
		].join("\n"),
		{ filename },
	);

/**
 * `json()` is typed `any`, so a cast on the parsed body asserts a shape the
 * caller controls and nothing verifies. The nextkit hard rule is to parse it
 * with Zod; this catches the two ways around that which still type-check.
 */
describe("nextkit/no-unvalidated-request-body", () => {
	it("flags a cast on the parsed body", () => {
		const out = lintHandler([
			"const body = (await req.json()) as { total: number };",
			"return Response.json(body);",
		]);
		expect(ruleIds(out)).toEqual([RULE]);
	});

	it("flags a type annotation doing the same work", () => {
		const out = lintHandler([
			"const body: { total: number } = await req.json();",
			"return Response.json(body);",
		]);
		expect(ruleIds(out)).toEqual([RULE]);
	});

	it("flags an as-unknown-as launder", () => {
		const out = lintHandler([
			"const body = (await req.json()) as unknown as { total: number };",
			"return Response.json(body);",
		]);
		expect(ruleIds(out)).toEqual([RULE]);
	});

	it("allows parsing with a schema", () => {
		const out = lintHandler([
			"const body = schema.parse(await req.json());",
			"return Response.json(body);",
		]);
		expect(out).toEqual([]);
	});

	it("allows unknown on the way into a parser, as a cast or an annotation", () => {
		expect(
			lintHandler([
				"const raw = (await req.json()) as unknown;",
				"return Response.json(schema.parse(raw));",
			]),
		).toEqual([]);
		expect(
			lintHandler([
				"const raw: unknown = await req.json();",
				"return Response.json(schema.parse(raw));",
			]),
		).toEqual([]);
	});

	it("says nothing about a response body outside a route", () => {
		const out = lintRule(
			"no-unvalidated-request-body",
			"export const load = async () => {\n" +
				"\tconst res = await fetch('/x');\n" +
				"\treturn (await res.json()) as { total: number };\n" +
				"};",
			{ filename: "src/lib/client.ts" },
		);
		expect(out).toEqual([]);
	});
});
