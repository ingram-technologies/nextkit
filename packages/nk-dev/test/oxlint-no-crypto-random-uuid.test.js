import { describe, expect, it } from "vitest";
import { lint as lintRule, ruleIds } from "./oxlint-harness.js";

const RULE = "nextkit/no-crypto-random-uuid";
const lint = (source) => lintRule("no-crypto-random-uuid", source);

describe("no-crypto-random-uuid", () => {
	it("flags the global call", () => {
		expect(ruleIds(lint(`export const id = crypto.randomUUID();`))).toEqual([RULE]);
	});

	it("flags it through globalThis", () => {
		expect(
			ruleIds(lint(`export const id = globalThis.crypto.randomUUID();`)),
		).toEqual([RULE]);
	});

	it("flags randomUUID imported from node:crypto", () => {
		const out = lint(
			`import { randomUUID } from "node:crypto";\nexport const id = randomUUID();`,
		);
		expect(ruleIds(out)).toEqual([RULE]);
	});

	it("flags it under an import alias", () => {
		const out = lint(
			`import { randomUUID as mint } from "crypto";\nexport const id = mint();`,
		);
		expect(ruleIds(out)).toEqual([RULE]);
	});

	it("flags it through the module imported whole, default or namespace", () => {
		// `import crypto from "node:crypto"` binds a local `crypto`, but it is the
		// same v4 mint, not a shadowing stub.
		for (const source of [
			`import crypto from "node:crypto";\nexport const id = crypto.randomUUID();`,
			`import * as c from "node:crypto";\nexport const id = c.randomUUID();`,
			`import nodeCrypto from "crypto";\nexport const id = nodeCrypto.randomUUID();`,
		]) {
			expect(ruleIds(lint(source))).toEqual([RULE]);
		}
	});

	it("does not flag the sanctioned UUIDv7 mint", () => {
		expect(
			lint(
				`import { uuidv7 } from "@ingram-tech/nk-db/id";\nexport const id = uuidv7();`,
			),
		).toEqual([]);
	});

	it("does not flag a local crypto that shadows the global", () => {
		expect(
			lint(
				`const crypto = { randomUUID: () => "stub" };\nexport const id = crypto.randomUUID();`,
			),
		).toEqual([]);
	});

	it("does not flag a crypto imported from some other module", () => {
		expect(
			lint(
				`import crypto from "./fake-crypto";\nexport const id = crypto.randomUUID();`,
			),
		).toEqual([]);
	});

	it("does not flag other members of the global", () => {
		expect(
			lint(`export const bytes = crypto.getRandomValues(new Uint8Array(16));`),
		).toEqual([]);
	});

	it("does not flag a same-named method on another object", () => {
		expect(
			lint(
				`declare const stub: { randomUUID(): string };\nexport const id = stub.randomUUID();`,
			),
		).toEqual([]);
	});

	it("respects a justified disable comment", () => {
		// The sanctioned escape for bearer tokens and nonces, which want v4.
		expect(
			lint(
				`// oxlint-disable-next-line nextkit/no-crypto-random-uuid -- CSRF nonce, wants v4 entropy\nexport const state = crypto.randomUUID();`,
			),
		).toEqual([]);
	});
});
