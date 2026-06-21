import { describe, expect, it } from "vitest";
import { negotiateAcceptLanguage } from "./negotiate.js";

const supported = ["en", "nl", "fr", "de"];

describe("negotiateAcceptLanguage", () => {
	it("matches on the primary subtag, ignoring region", () => {
		expect(negotiateAcceptLanguage("fr-BE,fr;q=0.9", supported)).toBe("fr");
	});

	it("returns the first supported match in header order", () => {
		expect(negotiateAcceptLanguage("es-ES,nl;q=0.8,en;q=0.5", supported)).toBe(
			"nl",
		);
	});

	it("is case-insensitive", () => {
		expect(negotiateAcceptLanguage("NL-be", supported)).toBe("nl");
	});

	it("returns undefined for no header or no match", () => {
		expect(negotiateAcceptLanguage(null, supported)).toBeUndefined();
		expect(negotiateAcceptLanguage("es-ES,it;q=0.9", supported)).toBeUndefined();
	});
});
