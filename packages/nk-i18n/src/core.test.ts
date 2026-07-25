import { afterEach, describe, expect, it, vi } from "vitest";
import { createT, defineI18nScope } from "./core.js";

const fr = {
	Hello: "Bonjour",
	'Results for "{query}"': 'Résultats pour "{query}"',
	"Showing {from}-{to} of {total, number} codes":
		"Affichage {from}-{to} sur {total, number} codes",
};
const nl = {
	Hello: "Hallo",
	'Results for "{query}"': 'Resultaten voor "{query}"',
	"Showing {from}-{to} of {total, number} codes":
		"Tonen {from}-{to} van {total, number} codes",
};

describe("createT", () => {
	it("translates a known key for a non-base locale", () => {
		const t = createT("fr", { fr, nl });
		expect(t("Hello")).toBe("Bonjour");
	});

	it("returns the English key for the base locale (no en catalog)", () => {
		const t = createT("en", { fr, nl });
		expect(t("Hello")).toBe("Hello");
	});

	it("falls back to the key when a translation is missing", () => {
		const t = createT("fr", { fr: {}, nl: {} });
		expect(t("Untranslated string")).toBe("Untranslated string");
	});

	it("interpolates ICU placeholders", () => {
		const t = createT("fr", { fr, nl });
		expect(t('Results for "{query}"', { query: "clay" })).toBe(
			'Résultats pour "clay"',
		);
	});

	it("applies locale-aware number formatting", () => {
		expect(
			createT("en", { fr, nl })("Showing {from}-{to} of {total, number} codes", {
				from: 1,
				to: 100,
				total: 1234,
			}),
		).toBe("Showing 1-100 of 1,234 codes");
		expect(
			createT("nl", { fr, nl })("Showing {from}-{to} of {total, number} codes", {
				from: 1,
				to: 100,
				total: 1234,
			}),
		).toBe("Tonen 1-100 van 1.234 codes");
	});

	it("accepts a scope as the message source", () => {
		const scope = defineI18nScope({ name: "test", messages: { fr, nl } });
		expect(createT("nl", scope)("Hello")).toBe("Hallo");
	});

	it("lets runtimeMessages override the static source", () => {
		const t = createT("fr", { fr, nl }, { fr: { Hello: "Salut" }, nl });
		expect(t("Hello")).toBe("Salut");
	});
});

describe("missingKeys policy", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('throws on a missing key when the policy is "error"', () => {
		const t = createT("fr", { fr: {}, nl: {} }, undefined, {
			missingKeys: "error",
		});
		expect(() => t("MissingErrorKey")).toThrow(/missing "fr" translation/);
	});

	it('warns once and falls back when the policy is "warn"', () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const t = createT("fr", { fr: {}, nl: {} }, undefined, {
			missingKeys: "warn",
		});
		// Distinct key so the module-level dedupe set can't be pre-primed by
		// another test.
		expect(t("MissingWarnKey")).toBe("MissingWarnKey");
		expect(t("MissingWarnKey")).toBe("MissingWarnKey"); // repeat is deduped
		expect(warn).toHaveBeenCalledTimes(1);
	});

	it('is silent and falls back by default (policy "ignore")', () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const t = createT("fr", { fr: {}, nl: {} }, undefined, {
			missingKeys: "ignore",
		});
		expect(t("MissingIgnoreKey")).toBe("MissingIgnoreKey");
		expect(warn).not.toHaveBeenCalled();
	});

	it("does not fire the policy for a present translation", () => {
		const t = createT("fr", { fr, nl }, undefined, { missingKeys: "error" });
		expect(t("Hello")).toBe("Bonjour");
	});
});

describe("format resilience", () => {
	it("degrades to the raw message on a malformed catalog entry instead of throwing", () => {
		// One bad fr entry must not 500 every French page rendering this key.
		const t = createT("fr", { fr: { "Hi {name}": "Salut {name" } });
		expect(t("Hi {name}", { name: "Ada" })).toBe("Salut {name");
	});

	it("degrades when a placeholder value is missing", () => {
		const t = createT("fr", { fr: { "Hi {name}": "Salut {name}" } });
		// oxlint-disable-next-line nextkit/t-requires-values -- the omission is under test
		expect(t("Hi {name}", {})).toBe("Salut {name}");
	});

	it("degrades on an invalid locale tag", () => {
		const t = createT("not a locale!", undefined);
		// The raw source string, uninterpolated — degraded but rendered.
		expect(t("Hi {name}", { name: "Ada" })).toBe("Hi {name}");
	});
});
