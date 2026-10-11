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

	it("replaces a locale the path already names, keeping other params", () => {
		const url = new URL(routing.urlForLocale("/p?hl=fr&q=vat%20id", "en"));
		expect(url.searchParams.getAll("hl")).toEqual(["en"]);
		expect(url.searchParams.get("q")).toBe("vat id");
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

	it("reads the locale off the pathname, not off the query string", () => {
		expect(prefixed.urlForLocale("/fr?q=1", "en")).toBe("https://acme.test/en?q=1");
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

	it("strips the prefix for the app-facing rewrite", () => {
		expect(prefixed.stripLocale("/fr/about")).toBe("/about");
		expect(prefixed.stripLocale("/fr")).toBe("/");
		expect(prefixed.stripLocale("/about")).toBe("/about");
		// A path merely starting with the letters must not be mistaken for one.
		expect(prefixed.stripLocale("/french-press")).toBe("/french-press");
	});

	it("relocalising an address equals localising the bare path", () => {
		// Idempotence over locale switches: a language switcher handed an
		// already-localized path must not stack prefixes.
		const relative = (url: string) => {
			const parsed = new URL(url);
			return `${parsed.pathname}${parsed.search}${parsed.hash}`;
		};
		for (const path of ["/", "/about", "/en/about", "/fr", "/fr?q=1", "/x#top"]) {
			for (const a of prefixed.locales) {
				for (const b of prefixed.locales) {
					const switched = relative(prefixed.urlForLocale(path, a));
					expect(prefixed.urlForLocale(switched, b)).toBe(
						prefixed.urlForLocale(path, b),
					);
				}
			}
		}
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

	// docs/i18n-routing.md "The precedence chain": url, account, cookie,
	// Accept-Language, country, default. Neighbouring signals name different
	// locales, so skipping or reordering any one of them changes the answer.
	const chain = {
		url: "fr",
		account: "nl",
		cookie: "en",
		acceptLanguage: "fr-BE",
		country: "NL",
	};
	it.each([
		[0, "fr"],
		[1, "nl"],
		[2, "en"],
		[3, "fr"],
		[4, "nl"],
		[5, "en"],
	])("with the top %i signals dropped, resolves to %s", (dropped, expected) => {
		const signals = Object.fromEntries(
			LOCALE_PRECEDENCE.slice(dropped).map((key) => [key, chain[key]]),
		);
		expect(resolveLocaleFromSignals(routing, signals)).toBe(expected);
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
});

describe("relocalising round-trips", () => {
	const strategies = [
		routing,
		defineLocaleRouting({
			baseUrl: "https://acme.test",
			locales: ["en", "fr", "nl"],
			defaultLocale: "en",
			strategy: "prefix",
		}),
	];
	const inputs = [
		"/",
		"/p",
		"/p?hl=fr",
		"/p?q=1&hl=nl&page=2",
		"/p?hl=fr&hl=nl",
		"/fr/p",
		"/nl?q=1",
		"/p#top",
	];

	it.each(strategies.map((r) => [r.strategy, r] as const))(
		"%s: the address for a locale names exactly that locale",
		(_strategy, r) => {
			for (const input of inputs) {
				for (const locale of r.locales) {
					expect(r.localeFromUrl(r.urlForLocale(input, locale))).toBe(locale);
				}
			}
		},
	);
});
