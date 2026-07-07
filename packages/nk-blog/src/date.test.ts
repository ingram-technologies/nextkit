import { describe, expect, it } from "vitest";
import { formatPostDate } from "./date.js";

describe("formatPostDate", () => {
	it("formats a UTC-midnight post date as that calendar day in every host zone", () => {
		// Post dates are normalized to UTC midnight; local-zone formatting would
		// render April 29 anywhere west of UTC.
		expect(formatPostDate("2026-04-30T00:00:00.000Z")).toBe("April 30, 2026");
	});

	it("respects locale and option overrides", () => {
		expect(
			formatPostDate("2026-04-30T00:00:00.000Z", "en", {
				year: "numeric",
				month: "short",
				day: "numeric",
			}),
		).toBe("Apr 30, 2026");
	});
});
