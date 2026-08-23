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

	it("keeps the default locale on the bare path and prefixes the rest", () => {
		expect(prefixed.urlForLocale("/about", "en")).toBe("https://acme.test/about");
		expect(prefixed.urlForLocale("/about", "fr")).toBe(
			"https://acme.test/fr/about",
		);
	});

	it("reads the locale back out of the pathname", () => {
		expect(prefixed.localeFromUrl("https://acme.test/fr/about")).toBe("fr");
		expect(prefixed.localeFromUrl("https://acme.test/about")).toBe("en");
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
