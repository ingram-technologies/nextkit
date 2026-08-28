import { describe, expect, it } from "vitest";
import {
	defineLocaleRouting,
	LOCALE_PRECEDENCE,
	resolveLocaleFromSignals,
	resolveLocaleFromSuppliers,
} from "./routing.js";

const routing = defineLocaleRouting({
	baseUrl: "https://acme.test",
	locales: ["en", "fr", "nl"],
	defaultLocale: "en",
	// BE is deliberately absent: geography does not disambiguate fr/nl there.
	countryLocales: { FR: "fr", NL: "nl", US: "en" },
});

describe("defineLocaleRouting: query strategy", () => {
	it("gives every locale its own address, default included", () => {
		expect(routing.urlForLocale("/pricing", "en")).toBe(
			"https://acme.test/pricing?hl=en",
		);
		expect(routing.urlForLocale("/pricing", "fr")).toBe(
			"https://acme.test/pricing?hl=fr",
		);
		expect(routing.bareUrl("/pricing")).toBe("https://acme.test/pricing");
	});

	it("reads back the locale it writes, for every locale", () => {
		for (const locale of routing.locales) {
			expect(routing.localeFromUrl(routing.urlForLocale("/x", locale))).toBe(
				locale,
			);
		}
	});

	it("treats the bare path as naming no locale", () => {
		expect(routing.localeFromUrl("https://acme.test/pricing")).toBeUndefined();
	});

	it("ignores an unsupported or malformed param value", () => {
		expect(routing.localeFromUrl("https://acme.test/x?hl=de")).toBeUndefined();
		expect(routing.localeFromUrl("https://acme.test/x?hl=")).toBeUndefined();
	});

	it("refuses a path that escapes the origin", () => {
		expect(() => routing.bareUrl("//evil.test/x")).toThrow(
			/outside the site origin/,
		);
	});

	it("rejects a default locale that is not in the locale list", () => {
		expect(() =>
			defineLocaleRouting({
				baseUrl: "https://acme.test",
				locales: ["fr"],
				defaultLocale: "en",
			}),
		).toThrow(/not in locales/);
	});
});

describe("defineLocaleRouting: prefix strategy", () => {
	const prefixed = defineLocaleRouting({
		baseUrl: "https://acme.test",
		locales: ["en", "fr"],
		defaultLocale: "en",
		strategy: "prefix",
	});

	it("gives every locale a prefix, the default included", () => {
		// The bare path belongs to no locale, so `en` does not get to own it.
		expect(prefixed.urlForLocale("/about", "en")).toBe(
			"https://acme.test/en/about",
		);
		expect(prefixed.urlForLocale("/about", "fr")).toBe(
			"https://acme.test/fr/about",
		);
	});

	it("treats a bare path as naming no locale, so negotiation decides", () => {
		// This is the whole point: returning the default locale here would make it
		// the URL signal, which outranks the cookie, so a visitor who chose French
		// would snap back to English on the first bare internal link they click.
		expect(prefixed.localeFromUrl("https://acme.test/about")).toBeUndefined();
		expect(prefixed.localeFromUrl("https://acme.test/")).toBeUndefined();
	});

	it("reads the locale back out of the pathname", () => {
		expect(prefixed.localeFromUrl("https://acme.test/fr/about")).toBe("fr");
		expect(prefixed.localeFromUrl("https://acme.test/en/about")).toBe("en");
		expect(prefixed.localeFromUrl("https://acme.test/fr")).toBe("fr");
	});

	it("round-trips every locale through its own address", () => {
		for (const locale of prefixed.locales) {
			expect(prefixed.localeFromUrl(prefixed.urlForLocale("/x", locale))).toBe(
				locale,
			);
		}
	});

	it("strips the prefix for the app-facing rewrite", () => {
		expect(prefixed.stripLocale("/fr/about")).toBe("/about");
		expect(prefixed.stripLocale("/fr")).toBe("/");
		expect(prefixed.stripLocale("/about")).toBe("/about");
		// A path merely starting with the letters must not be mistaken for one.
		expect(prefixed.stripLocale("/french-press")).toBe("/french-press");
	});

	it("does not double-prefix an already-prefixed path", () => {
		expect(prefixed.urlForLocale("/fr/about", "nl" as "fr")).toBe(
			"https://acme.test/nl/about",
		);
	});

	it("is identity under the query strategy", () => {
		expect(routing.stripLocale("/about")).toBe("/about");
	});
});

describe("locale precedence", () => {
	it("prefers the URL over every other signal, the account setting included", () => {
		expect(
			resolveLocaleFromSignals(routing, {
				url: "fr",
				account: "nl",
				cookie: "nl",
				acceptLanguage: "nl-NL",
				country: "NL",
			}),
		).toBe("fr");
	});

	it("falls through the chain in order", () => {
		const signals = {
			account: "fr",
			cookie: "nl",
			acceptLanguage: "nl-NL",
			country: "NL",
		};
		expect(resolveLocaleFromSignals(routing, signals)).toBe("fr");
		expect(resolveLocaleFromSignals(routing, { ...signals, account: null })).toBe(
			"nl",
		);
	});

	it("negotiates Accept-Language rather than matching it literally", () => {
		expect(
			resolveLocaleFromSignals(routing, {
				acceptLanguage: "de;q=0.9, fr-BE;q=0.8",
			}),
		).toBe("fr");
	});

	it("maps country only through countryLocales, and leaves Belgium ambiguous", () => {
		expect(resolveLocaleFromSignals(routing, { country: "fr" })).toBe("fr");
		expect(resolveLocaleFromSignals(routing, { country: "BE" })).toBe("en");
	});

	it("skips signals that are not supported locales", () => {
		expect(resolveLocaleFromSignals(routing, { cookie: "de", account: "fr" })).toBe(
			"fr",
		);
	});

	it("falls back to the default locale when nothing is known", () => {
		expect(resolveLocaleFromSignals(routing, {})).toBe("en");
	});
});

describe("resolveLocaleFromSuppliers", () => {
	it("agrees with the eager resolver on every prefix of the chain", async () => {
		const signals = {
			url: "fr",
			account: "nl",
			cookie: "en",
			acceptLanguage: "nl-NL",
			country: "US",
		};
		// Drop the chain one signal at a time; both resolvers must stay in step.
		for (let i = 0; i <= LOCALE_PRECEDENCE.length; i++) {
			const partial = Object.fromEntries(
				LOCALE_PRECEDENCE.slice(i).map((key) => [key, signals[key]]),
			);
			const suppliers = Object.fromEntries(
				Object.entries(partial).map(([key, value]) => [key, () => value]),
			);
			expect(await resolveLocaleFromSuppliers(routing, suppliers)).toBe(
				resolveLocaleFromSignals(routing, partial),
			);
		}
	});

	it("never calls a supplier the chain does not reach", async () => {
		let accountCalls = 0;
		const locale = await resolveLocaleFromSuppliers(routing, {
			url: () => "fr",
			account: () => {
				accountCalls += 1;
				return "nl";
			},
		});
		expect(locale).toBe("fr");
		expect(accountCalls).toBe(0);
	});

	it("awaits async suppliers", async () => {
		const locale = await resolveLocaleFromSuppliers(routing, {
			account: () => Promise.resolve("nl"),
		});
		expect(locale).toBe("nl");
	});
});

describe("typing", () => {
	// Sites used to write their own guard and cast the resolver's result; the
	// first consumer of this API had `(await resolve()) as Locale` in it, which
	// is the tell that the types were doing no work.
	const typed = defineLocaleRouting({
		baseUrl: "https://acme.test",
		locales: ["en", "fr"],
		defaultLocale: "en",
	});

	it("narrows an unknown value to the site's locale union", () => {
		const raw: unknown = "fr";
		if (typed.isLocale(raw)) {
			const locale: "en" | "fr" = raw;
			expect(locale).toBe("fr");
		} else {
			throw new Error("expected the guard to narrow");
		}
	});

	it("returns the union from resolve, not a bare string", () => {
		const locale: "en" | "fr" = typed.resolve({ cookie: "fr" });
		expect(locale).toBe("fr");
	});

	it("narrows localeFromUrl too", () => {
		const named: "en" | "fr" | undefined = typed.localeFromUrl(
			"https://acme.test/x?hl=fr",
		);
		expect(named).toBe("fr");
	});
});

describe("hreflang tags and html lang", () => {
	const regional = defineLocaleRouting({
		baseUrl: "https://acme.test",
		locales: ["en", "fr", "nl"],
		defaultLocale: "en",
		hrefLangTags: { en: "en-BE", fr: "fr-BE", nl: "nl-BE" },
	});

	it("uses the regional tag for <html lang> when one is set", () => {
		expect(regional.htmlLang("fr")).toBe("fr-BE");
	});

	it("falls back to the plain locale when no tag is set", () => {
		expect(routing.htmlLang("fr")).toBe("fr");
	});

	it("carries the tags on the routing object, so no second config is needed", () => {
		// A site with regional tags used to build one object for serving and
		// another for hreflang, which is precisely the drift this prevents.
		expect(regional.hrefLangTags).toEqual({
			en: "en-BE",
			fr: "fr-BE",
			nl: "nl-BE",
		});
	});
});

describe("cookie name", () => {
	it("lives on routing, so middleware and resolver cannot disagree", () => {
		expect(routing.cookieName).toBe("locale");
		expect(
			defineLocaleRouting({
				baseUrl: "https://acme.test",
				locales: ["en"],
				defaultLocale: "en",
				cookieName: "lang",
			}).cookieName,
		).toBe("lang");
	});
});
