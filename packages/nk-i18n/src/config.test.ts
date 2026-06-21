import { describe, expect, expectTypeOf, it } from "vitest";
import { defineI18nConfig, deriveLocaleConstants, localeMap } from "./config.js";

const i18nConfig = defineI18nConfig({
	baseLocale: "en",
	locales: {
		en: {
			label: "English",
			missingKeys: "ignore",
			htmlLang: "en",
			ogLocale: "en_US",
		},
		nl: {
			label: "Nederlands",
			missingKeys: "error",
			htmlLang: "nl-BE",
			ogLocale: "nl_BE",
		},
		fr: {
			label: "Français",
			missingKeys: "error",
			htmlLang: "fr-BE",
			ogLocale: "fr_BE",
		},
	},
});

describe("config", () => {
	it("derives the locale constants in declaration order", () => {
		const { SUPPORTED_LOCALES, DEFAULT_LOCALE, LOCALE_NAMES } =
			deriveLocaleConstants(i18nConfig);
		expect(SUPPORTED_LOCALES).toEqual(["en", "nl", "fr"]);
		expect(DEFAULT_LOCALE).toBe("en");
		expect(LOCALE_NAMES).toEqual({
			en: "English",
			nl: "Nederlands",
			fr: "Français",
		});
	});

	it("builds per-locale maps from custom fields with localeMap", () => {
		expect(localeMap(i18nConfig, (def) => def.htmlLang)).toEqual({
			en: "en",
			nl: "nl-BE",
			fr: "fr-BE",
		});
		expect(localeMap(i18nConfig, (def) => def.ogLocale)).toEqual({
			en: "en_US",
			nl: "nl_BE",
			fr: "fr_BE",
		});
	});

	it("passes the locale code as the second pick argument", () => {
		expect(localeMap(i18nConfig, (_def, locale) => `/${locale}/`)).toEqual({
			en: "/en/",
			nl: "/nl/",
			fr: "/fr/",
		});
	});

	it("preserves literal label types on LOCALE_NAMES", () => {
		const { LOCALE_NAMES } = deriveLocaleConstants(i18nConfig);
		// Labels keep their literal type so they can be used as translation keys
		// (e.g. t(LOCALE_NAMES[loc])).
		expectTypeOf(LOCALE_NAMES.en).toEqualTypeOf<"English">();
		expectTypeOf(LOCALE_NAMES.fr).toEqualTypeOf<"Français">();
		expect(LOCALE_NAMES.nl).toBe("Nederlands");
	});
});
