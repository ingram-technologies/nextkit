import { describe, expect, it, vi } from "vitest";
import { uuidGenerateId } from "./id.js";

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

	it("is time-ordered: ids from a later millisecond sort after earlier ones", () => {
		// The point of UUIDv7 is the ms-timestamp prefix that makes ids sortable
		// by creation time (DB index locality, cursor pagination). There's no
		// monotonic counter, so order *within* a single ms is undefined — drive
		// the clock to compare across milliseconds, which is the real guarantee
		// and makes the assertion deterministic.
		vi.useFakeTimers();
		try {
			vi.setSystemTime(1_700_000_000_000);
			const a = uuidGenerateId();
			vi.setSystemTime(1_700_000_000_001);
			const b = uuidGenerateId();
			expect(b > a).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it("is unique across many calls", () => {
		const ids = new Set(Array.from({ length: 1000 }, () => uuidGenerateId()));
		expect(ids.size).toBe(1000);
	});
});
