import { describe, expect, it } from "vitest";
import { uuidGenerateId } from "./options";

describe("uuidGenerateId", () => {
	it("returns a canonical UUID string", () => {
		expect(uuidGenerateId()).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		);
	});

	it("is version 7 with the RFC 9562 variant", () => {
		const id = uuidGenerateId();
		expect(id[14]).toBe("7"); // version nibble
		expect(["8", "9", "a", "b"]).toContain(id[19]); // variant (10xx)
	});

	it("is time-ordered: later ids sort after earlier ones", () => {
		const a = uuidGenerateId();
		const b = uuidGenerateId();
		// The 48-bit ms-timestamp prefix makes string order match creation order
		// (equal within the same ms; never earlier).
		expect(b >= a).toBe(true);
	});

	it("is unique across many calls", () => {
		const ids = new Set(Array.from({ length: 1000 }, () => uuidGenerateId()));
		expect(ids.size).toBe(1000);
	});
});
