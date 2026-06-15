import { describe, expect, it } from "vitest";
import { base58Id, fromPrefixedId, toPrefixedId } from "./id";
import { uuidGenerateId } from "./options";

// 16-byte input (hex) -> canonical base58 body. Identical to the Python twin in
// cloud.ingram.tech's `tests/test_ids.py` — this is the cross-impl contract.
const VECTORS: Record<string, string> = {
	"00000000000000000000000000000000": "1".repeat(22),
	"00000000000000000000000000000001": `${"1".repeat(21)}2`,
	"000000000000000000000000000000ff": `${"1".repeat(20)}5Q`,
	ffffffffffffffffffffffffffffffff: "YcVfxkQb6JRzqk5kF2tNLv",
};

const hexToUuid = (hex: string): string =>
	`${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;

describe("base58 id codec", () => {
	it("matches the cross-impl vectors", () => {
		for (const [hex, body] of Object.entries(VECTORS)) {
			expect(toPrefixedId(hexToUuid(hex), "x")).toBe(`x_${body}`);
		}
	});

	it("round-trips uuid <-> prefixed id losslessly", () => {
		const uuid = uuidGenerateId();
		expect(fromPrefixedId(toPrefixedId(uuid, "team"))).toBe(uuid);
	});

	it("mints a 22-char base58 body with the given prefix", () => {
		// Bitcoin alphabet: no 0 / I / O / l.
		expect(base58Id("agt")).toMatch(/^agt_[1-9A-HJ-NP-Za-km-z]{22}$/);
	});

	it("round-trips a freshly minted id", () => {
		const id = base58Id("smt");
		expect(toPrefixedId(fromPrefixedId(id), "smt")).toBe(id);
	});

	it("rejects a body with a non-base58 char", () => {
		expect(() => fromPrefixedId("x_0OIl00000000000000000")).toThrow();
	});
});
