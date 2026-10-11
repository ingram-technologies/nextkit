import { describe, expect, it } from "vitest";
import { lint as lintRule, ruleIds } from "./oxlint-harness.js";

const RULE = "nextkit/no-sql-array-cast";
const lint = (source) => lintRule("no-sql-array-cast", source);

/**
 * Drizzle expands an interpolated array into separate bound parameters, so the
 * cast lands on a record and Postgres refuses it at run time. Types and build
 * are both happy, which is why it needs a rule.
 */
describe("nextkit/no-sql-array-cast", () => {
	it("flags an array cast on an interpolation and names the type", () => {
		const out = lint("const q = sql`select ${ids}::uuid[]`;");
		expect(ruleIds(out)).toEqual([RULE]);
		expect(out[0].message).toContain("uuid[]");
	});

	it("flags the cast with whitespace around ::, which Postgres accepts", () => {
		const out = lint("const q = sql`select ${ids} :: uuid[]`;");
		expect(ruleIds(out)).toEqual([RULE]);
		expect(out[0].message).toContain("uuid[]");
	});

	it("flags a quoted or schema-qualified type too", () => {
		expect(ruleIds(lint('const q = sql`select ${xs}::public."Kind"[]`;'))).toEqual([
			RULE,
		]);
	});

	it("allows a scalar cast", () => {
		expect(lint("const q = sql`select ${id}::uuid`;")).toEqual([]);
		expect(lint("const q = sql`select ${id} ::uuid`;")).toEqual([]);
	});

	it("allows an array constructor", () => {
		expect(
			lint("const q = sql`select array[${sql.join(parts)}]::uuid[]`;"),
		).toEqual([]);
	});

	it("leaves other tagged templates alone", () => {
		expect(lint("const q = gql`select ${ids}::uuid[]`;")).toEqual([]);
	});
});
