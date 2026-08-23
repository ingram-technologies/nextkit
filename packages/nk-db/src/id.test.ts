import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	base58Id,
	createIdRegistry,
	decodeAnyId,
	entityOf,
	fromPrefixedId,
	isUuid,
	toPrefixedId,
	uuidGenerateId,
} from "./id.js";

// The codec and its cross-impl vectors are tested in `id758`; this only checks
// that the nextkit-era names still resolve to it and that the surface is whole.
describe("@ingram-tech/nk-db/id", () => {
	it("keeps the pre-extraction names working", () => {
		const uuid = uuidGenerateId();
		expect(isUuid(uuid)).toBe(true);
		expect(fromPrefixedId(toPrefixedId(uuid, "team"))).toBe(uuid);
		expect(base58Id("agt")).toMatch(/^agt_[1-9A-HJ-NP-Za-km-z]{22}$/);
	});

	it("re-exports the registry helpers", () => {
		const ids = createIdRegistry({ org: "org" });
		const id = ids.org.mint();
		expect(entityOf(ids, id)).toBe("org");
		expect(decodeAnyId(ids, id)).toBe(ids.org.decode(id));
	});

	it("stays isomorphic: imports only id758", () => {
		const source = readFileSync(new URL("./id.ts", import.meta.url), "utf8");
		const imports = source
			.split("\n")
			.filter((line) => /^\s*(import\s|export \* from|.*\brequire\()/.test(line))
			.map((line) => line.trim());
		expect(imports).toEqual([
			'export * from "id758";',
			'import { decodeId, encodeId, mintId, uuidv7 } from "id758";',
		]);
	});
});
