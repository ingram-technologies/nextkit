import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	base58Id,
	decodeId,
	encodeId,
	fromPrefixedId,
	mintId,
	toPrefixedId,
	uuidGenerateId,
	uuidv7,
} from "./id.js";

// The codec and its cross-impl vectors are tested in `id758`; this only checks
// that the nextkit-era names still resolve to it and that the module stays
// isomorphic.
describe("@ingram-tech/nk-db/id", () => {
	it("keeps the pre-extraction names working as aliases of the id758 functions", () => {
		expect(uuidGenerateId).toBe(uuidv7);
		expect(toPrefixedId).toBe(encodeId);
		expect(fromPrefixedId).toBe(decodeId);
		expect(base58Id).toBe(mintId);
	});

	it("stays isomorphic: imports only id758", () => {
		const source = readFileSync(new URL("./id.ts", import.meta.url), "utf8");
		// Static `from "x"`, side-effect `import "x"`, dynamic `import("x")` and
		// `require("x")` — every way a module specifier can appear.
		const specifiers = [
			...source.matchAll(
				/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']([^"']+)["']/g,
			),
		].map((match) => match[1]);
		expect(specifiers.length).toBeGreaterThan(0);
		for (const specifier of specifiers) {
			expect(
				specifier === "id758" || specifier?.startsWith("id758/"),
				`unexpected import "${specifier}"`,
			).toBe(true);
		}
	});
});
