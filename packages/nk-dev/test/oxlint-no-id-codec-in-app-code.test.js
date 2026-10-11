import { describe, expect, it } from "vitest";
import { lint as lintRule, ruleIds } from "./oxlint-harness.js";

const RULE = "nextkit/no-id-codec-in-app-code";
const lint = (source, filename = "fixture.ts") =>
	lintRule("no-id-codec-in-app-code", source, { filename });

describe("no-id-codec-in-app-code", () => {
	it("flags the bare codec functions imported from id758", () => {
		const out = lint(
			`import { decodeId } from "id758";\nexport const u = decodeId("inv_x");`,
		);
		expect(ruleIds(out)).toEqual([RULE]);
	});

	it("flags them from the nk-db re-export, deprecated names included", () => {
		const out = lint(
			`import { fromPrefixedId } from "@ingram-tech/nk-db/id";\nexport const u = fromPrefixedId("inv_x");`,
		);
		expect(ruleIds(out)).toEqual([RULE]);
	});

	it("flags a registry helper's encode / decode / decodeOrNull", () => {
		for (const method of ["encode", "decode", "decodeOrNull"]) {
			const out = lint(
				`import { ids } from "@/lib/ids";\nexport const v = ids.invoice.${method}("x");`,
			);
			expect(ruleIds(out)).toEqual([RULE]);
			expect(out[0].message).toContain(`ids.invoice.${method}()`);
		}
	});

	it("follows the registry under an import alias", () => {
		const out = lint(
			`import { ids as reg } from "./ids";\nexport const v = reg.org.decode("x");`,
		);
		expect(ruleIds(out)).toEqual([RULE]);
	});

	it("does not flag validation, minting, or the prefix", () => {
		expect(
			lint(
				`import { ids } from "./ids";\nexport const ok = ids.invoice.is("x");\nexport const fresh = ids.invoice.mint();\nexport const p = ids.invoice.prefix;`,
			),
		).toEqual([]);
	});

	it("does not flag the isomorphic mint or the column bindings", () => {
		expect(
			lint(
				`import { uuidv7, createIdRegistry } from "id758";\nimport { createIdColumns } from "@ingram-tech/nk-db/id/drizzle";\nexport const id = uuidv7();\nexport const ids = createIdRegistry({ a: "a" });\nexport const cols = createIdColumns(ids);`,
			),
		).toEqual([]);
	});

	it("does not flag a same-named method on another object", () => {
		expect(
			lint(
				`declare const codec: { thing: { decode(s: string): string } };\nexport const v = codec.thing.decode("x");\nexport const bytes = new TextEncoder().encode("x");`,
			),
		).toEqual([]);
	});

	it("is silent where the boundary is built: ids.ts, schema.ts (tests via the shared oxlintrc override)", () => {
		const source = `import { decodeId } from "id758";\nexport const u = decodeId("inv_x");`;
		expect(lint(source, "lib/ids.ts")).toEqual([]);
		expect(lint(source, "db/schema.ts")).toEqual([]);
		expect(lint(source, "id.ts")).toEqual([]);
	});
});
