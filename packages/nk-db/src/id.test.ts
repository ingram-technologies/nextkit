import { describe, expect, it } from "vitest";
import {
	base58Id,
	createIdRegistry,
	fromPrefixedId,
	toPrefixedId,
	uuidGenerateId,
} from "./id";

// 16-byte input (hex) -> canonical base58 body. These vectors are the
// cross-impl contract: keep any non-JS twin of this codec identical to them.
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

describe("uuidGenerateId", () => {
	it("mints a version-7 variant-10 uuid", () => {
		expect(uuidGenerateId()).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		);
	});

	it("is unique across many mints", () => {
		const ids = new Set(Array.from({ length: 1000 }, () => uuidGenerateId()));
		expect(ids.size).toBe(1000);
	});
});

describe("createIdRegistry", () => {
	const ids = createIdRegistry({ org: "org", agent: "agt", session: "cs" });

	it("mints typed, prefix-tagged ids per entity", () => {
		expect(ids.org.mint()).toMatch(/^org_[1-9A-HJ-NP-Za-km-z]{22}$/);
		expect(ids.agent.mint()).toMatch(/^agt_/);
		expect(ids.session.prefix).toBe("cs");
	});

	it("encodes and decodes round-trip", () => {
		const uuid = uuidGenerateId();
		const id = ids.org.encode(uuid);
		expect(id.startsWith("org_")).toBe(true);
		expect(ids.org.decode(id)).toBe(uuid);
	});

	it("decode rejects a foreign or malformed prefix", () => {
		const agentId = ids.agent.mint();
		expect(() => ids.org.decode(agentId)).toThrow();
		expect(() => ids.org.decode("org_short")).toThrow();
		expect(ids.org.is(agentId)).toBe(false);
		expect(ids.agent.is(agentId)).toBe(true);
	});

	it("decodeOrNull recovers a valid id and returns null otherwise", () => {
		const uuid = uuidGenerateId();
		const id = ids.org.encode(uuid);
		expect(ids.org.decodeOrNull(id)).toBe(uuid);
		expect(ids.org.decodeOrNull(ids.agent.mint())).toBeNull();
		expect(ids.org.decodeOrNull("org_short")).toBeNull();
		expect(ids.org.decodeOrNull("not-an-id")).toBeNull();
	});
});

describe("decode58 range", () => {
	it("rejects a 22-char body that overflows 128 bits instead of aliasing", () => {
		// 58^22 > 2^128: the all-'z' body is regex-valid but out of uuid range;
		// truncating it would make two distinct wire ids decode to one UUID.
		expect(() => fromPrefixedId("x_zzzzzzzzzzzzzzzzzzzzzz")).toThrow(
			/out of uuid range/,
		);
	});
});
