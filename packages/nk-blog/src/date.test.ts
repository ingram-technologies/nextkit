import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatPostDate } from "./date.js";

// Post dates are UTC midnight, so a local-zone formatter renders the previous
// day anywhere west of UTC. Pin the host zone there, or these tests cannot fail
// on a UTC CI box.
const UTC_MIDNIGHT = "2026-04-30T00:00:00.000Z";
let previousTz: string | undefined;

beforeAll(() => {
	previousTz = process.env.TZ;
	process.env.TZ = "America/Los_Angeles";
});

afterAll(() => {
	if (previousTz === undefined) delete process.env.TZ;
	else process.env.TZ = previousTz;
});

describe("formatPostDate", () => {
	it("host zone is west of UTC (guards the tests below against vacuity)", () => {
		expect(new Date(UTC_MIDNIGHT).getDate()).toBe(29);
	});

	it("formats a UTC-midnight post date as that calendar day", () => {
		expect(formatPostDate(UTC_MIDNIGHT)).toBe("April 30, 2026");
	});

	it("still formats in UTC when custom options omit timeZone", () => {
		expect(
			formatPostDate(UTC_MIDNIGHT, "en", {
				year: "numeric",
				month: "short",
				day: "numeric",
			}),
		).toBe("Apr 30, 2026");
	});

	it("lets an explicit timeZone option win", () => {
		expect(
			formatPostDate(UTC_MIDNIGHT, "en", {
				day: "numeric",
				timeZone: "America/Los_Angeles",
			}),
		).toBe("29");
	});
});
