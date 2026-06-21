import { describe, expect, it } from "vitest";
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
