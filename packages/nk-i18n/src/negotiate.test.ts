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

	it("is case-insensitive on the supported side too, returning it verbatim", () => {
		// A supported list with uppercase or region-qualified entries must still
		// match a lowercased header, and echo the caller's own casing back.
		expect(negotiateAcceptLanguage("nl", ["EN", "NL", "FR"])).toBe("NL");
		expect(negotiateAcceptLanguage("en-US", ["en-GB", "fr"])).toBe("en-GB");
	});

	it("returns undefined for no header or no match", () => {
		expect(negotiateAcceptLanguage(null, supported)).toBeUndefined();
		expect(negotiateAcceptLanguage("es-ES,it;q=0.9", supported)).toBeUndefined();
	});
});

describe("q-value handling (RFC 9110)", () => {
	it("prefers the highest quality, not header order", () => {
		expect(negotiateAcceptLanguage("en;q=0.5, fr;q=0.9", ["en", "fr"])).toBe("fr");
	});

	it("never matches an explicitly rejected q=0 language", () => {
		expect(negotiateAcceptLanguage("fr, en;q=0", ["en"])).toBeUndefined();
		expect(negotiateAcceptLanguage("fr, en;q=0", ["en", "fr"])).toBe("fr");
	});

	it("breaks quality ties in header order", () => {
		expect(negotiateAcceptLanguage("nl;q=0.8, fr;q=0.8", ["fr", "nl"])).toBe("nl");
	});

	it("treats a missing q as 1", () => {
		expect(negotiateAcceptLanguage("fr;q=0.9, en", ["en", "fr"])).toBe("en");
	});
});
