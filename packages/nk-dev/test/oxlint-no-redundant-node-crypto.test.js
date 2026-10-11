import { describe, expect, it } from "vitest";
import { lint as lintRule, ruleIds } from "./oxlint-harness.js";

const RULE = "nextkit/no-redundant-node-crypto";
const lint = (source) => lintRule("no-redundant-node-crypto", source);

describe("no-redundant-node-crypto", () => {
	it.each(["randomUUID", "getRandomValues", "subtle", "webcrypto"])(
		"flags %s imported from node:crypto",
		(name) => {
			expect(ruleIds(lint(`import { ${name} } from "node:crypto";\n`))).toEqual([
				RULE,
			]);
		},
	);

	it("flags the unprefixed module too", () => {
		expect(ruleIds(lint(`import { randomUUID } from "crypto";\n`))).toEqual([RULE]);
	});

	it("names the global to reach for instead", () => {
		const out = lint(`import { subtle } from "node:crypto";\n`);
		expect(out[0].message).toContain("`crypto.subtle`");
	});

	it("flags only the redundant name alongside a legitimate one", () => {
		// The report is per specifier, not per import: createHash has no global
		// equivalent and must stay.
		const out = lint(
			`import { createHash, randomUUID } from "node:crypto";\nexport const h = createHash("sha256");\nexport const id = randomUUID();\n`,
		);
		expect(ruleIds(out)).toEqual([RULE]);
		expect(out[0].message).toContain("`randomUUID`");
	});

	it("flags a member access through a namespace import", () => {
		const out = lint(
			`import * as nodeCrypto from "node:crypto";\nexport const id = nodeCrypto.randomUUID();\n`,
		);
		expect(ruleIds(out)).toEqual([RULE]);
	});

	it("flags a member access through a default import", () => {
		const out = lint(
			`import nodeCrypto from "node:crypto";\nexport const id = nodeCrypto.randomUUID();\n`,
		);
		expect(ruleIds(out)).toEqual([RULE]);
	});

	it("does not flag node:crypto exports with no global equivalent", () => {
		expect(
			lint(
				`import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";\n`,
			),
		).toEqual([]);
	});

	it("does not flag other members of a namespace import", () => {
		expect(
			lint(
				`import * as nodeCrypto from "node:crypto";\nexport const h = nodeCrypto.createHash("sha256");\n`,
			),
		).toEqual([]);
	});

	it("does not flag the global it is asking for", () => {
		expect(lint(`export const id = crypto.randomUUID();\n`)).toEqual([]);
	});

	it("does not flag a same-named import from another module", () => {
		expect(lint(`import { subtle } from "./theme";\n`)).toEqual([]);
	});
});
