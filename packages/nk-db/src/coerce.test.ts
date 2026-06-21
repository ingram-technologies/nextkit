import { describe, expect, it } from "vitest";
import { z } from "zod";
import { pgNumericToNumber, pgTimestampToIso } from "./coerce.js";

const isoDatetime = z.iso.datetime();

describe("pgTimestampToIso", () => {
	it("normalizes the Postgres text form (space separator, short offset)", () => {
		const out = pgTimestampToIso("2026-06-21 18:22:08.331494+00");
		expect(out).toBe("2026-06-21T18:22:08.331Z");
		expect(isoDatetime.safeParse(out).success).toBe(true);
	});

	it("normalizes the supabase-js form (+00:00 offset)", () => {
		const out = pgTimestampToIso("2026-06-21T18:22:08.331494+00:00");
		expect(out).toBe("2026-06-21T18:22:08.331Z");
		expect(isoDatetime.safeParse(out).success).toBe(true);
	});

	it("preserves the instant across a non-UTC offset", () => {
		expect(pgTimestampToIso("2026-06-21 20:22:08.331494+02")).toBe(
			"2026-06-21T18:22:08.331Z",
		);
	});

	it("guards the premise: both raw forms fail z.iso.datetime() unnormalized", () => {
		expect(isoDatetime.safeParse("2026-06-21 18:22:08.331494+00").success).toBe(
			false,
		);
		expect(isoDatetime.safeParse("2026-06-21T18:22:08.331494+00:00").success).toBe(
			false,
		);
	});

	it("passes null through", () => {
		expect(pgTimestampToIso(null)).toBeNull();
	});
});

describe("pgNumericToNumber", () => {
	it("coerces a numeric string to a number", () => {
		expect(pgNumericToNumber("123.4500")).toBe(123.45);
		expect(pgNumericToNumber("-3.2500")).toBe(-3.25);
		expect(pgNumericToNumber("99.0000")).toBe(99);
	});

	it("passes null through", () => {
		expect(pgNumericToNumber(null)).toBeNull();
	});
});
