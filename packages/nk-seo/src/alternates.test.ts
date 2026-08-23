import { describe, expect, it } from "vitest";
import { hreflangAlternates } from "./alternates.js";

const baseUrl = "https://acme.test";

describe("hreflangAlternates", () => {
	it("query strategy: appends the locale param to the canonical for every locale", () => {
		const { canonical, links } = hreflangAlternates(
			{ baseUrl, locales: ["en", "fr"] },
			"/about",
		);
		expect(canonical).toBe("https://acme.test/about");
		expect(links).toEqual([
			{ hrefLang: "en", href: "https://acme.test/about?hl=en" },
			{ hrefLang: "fr", href: "https://acme.test/about?hl=fr" },
			{ hrefLang: "x-default", href: "https://acme.test/about" },
		]);
	});

	it("query strategy: honors a custom param name", () => {
		const { links } = hreflangAlternates(
			{ baseUrl, locales: ["en"], param: "lang" },
			"/",
		);
		expect(links[0]?.href).toBe("https://acme.test/?lang=en");
	});

	it("prefix strategy: keeps the default locale bare and prefixes the rest", () => {
		const { links } = hreflangAlternates(
			{ baseUrl, locales: ["en", "fr"], strategy: "prefix", defaultLocale: "en" },
			"/about",
		);
		expect(links).toEqual([
			{ hrefLang: "en", href: "https://acme.test/about" },
			{ hrefLang: "fr", href: "https://acme.test/fr/about" },
			{ hrefLang: "x-default", href: "https://acme.test/about" },
		]);
	});

	it("prefix strategy: the root path gets bare locale prefixes", () => {
		const { links } = hreflangAlternates(
			{ baseUrl, locales: ["en", "fr"], strategy: "prefix", defaultLocale: "en" },
			"/",
		);
		expect(links[1]?.href).toBe("https://acme.test/fr");
	});

	it("maps locales to regional hreflang tags", () => {
		const { links } = hreflangAlternates(
			{
				baseUrl,
				locales: ["en", "fr"],
				hrefLangTags: { en: "en-BE", fr: "fr-BE" },
			},
			"/p",
		);
		expect(links.map((l) => l.hrefLang)).toEqual(["en-BE", "fr-BE", "x-default"]);
	});

	it("does not emit double slashes when baseUrl has a trailing slash", () => {
		const { canonical, links } = hreflangAlternates(
			{
				baseUrl: "https://acme.test/",
				locales: ["en", "fr"],
				strategy: "prefix",
				defaultLocale: "en",
			},
			"/about",
		);
		expect(canonical).toBe("https://acme.test/about");
		expect(links[1]?.href).toBe("https://acme.test/fr/about");
	});

	it("prefix strategy: strips an existing locale prefix instead of double-prefixing", () => {
		// Middleware's x-pathname carries the real (prefixed) path on a localized
		// route; blindly prepending produced /fr/fr/about + /en/fr/about.
		const { canonical, links } = hreflangAlternates(
			{ baseUrl, locales: ["en", "fr"], strategy: "prefix", defaultLocale: "en" },
			"/fr/about",
		);
		expect(links).toEqual([
			{ hrefLang: "en", href: "https://acme.test/about" },
			{ hrefLang: "fr", href: "https://acme.test/fr/about" },
			{ hrefLang: "x-default", href: "https://acme.test/about" },
		]);
		// …and the canonical self-references the French variant being rendered.
		expect(canonical).toBe("https://acme.test/fr/about");
	});

	it("prefixDefaultLocale: prefixes every locale and points x-default at the default one", () => {
		// Sites whose negotiation redirects bare paths have no unprefixed
		// variant: emitting one would annotate a URL that 3xx-redirects.
		const { canonical, links } = hreflangAlternates(
			{
				baseUrl,
				locales: ["en", "fr"],
				strategy: "prefix",
				defaultLocale: "en",
				prefixDefaultLocale: true,
			},
			"/about",
		);
		expect(links).toEqual([
			{ hrefLang: "en", href: "https://acme.test/en/about" },
			{ hrefLang: "fr", href: "https://acme.test/fr/about" },
			{ hrefLang: "x-default", href: "https://acme.test/en/about" },
		]);
		expect(canonical).toBe("https://acme.test/en/about");
	});

	it("prefixDefaultLocale: the default locale's own page canonicalizes to its prefixed URL", () => {
		const { canonical } = hreflangAlternates(
			{
				baseUrl,
				locales: ["en", "fr"],
				strategy: "prefix",
				defaultLocale: "en",
				prefixDefaultLocale: true,
			},
			"/en/about",
		);
		expect(canonical).toBe("https://acme.test/en/about");
	});

	it("prefixDefaultLocale: the root path prefixes without a trailing slash", () => {
		const { links } = hreflangAlternates(
			{
				baseUrl,
				locales: ["en", "fr"],
				strategy: "prefix",
				defaultLocale: "en",
				prefixDefaultLocale: true,
			},
			"/",
		);
		expect(links.map((l) => l.href)).toEqual([
			"https://acme.test/en",
			"https://acme.test/fr",
			"https://acme.test/en",
		]);
	});

	it("exposes the links keyed by hreflang for Metadata.alternates.languages", () => {
		const { languages } = hreflangAlternates(
			{ baseUrl, locales: ["en", "fr"], strategy: "prefix", defaultLocale: "en" },
			"/about",
		);
		expect(languages).toEqual({
			en: "https://acme.test/about",
			fr: "https://acme.test/fr/about",
			"x-default": "https://acme.test/about",
		});
	});

	it("prefix strategy: requires defaultLocale", () => {
		expect(() =>
			hreflangAlternates({ baseUrl, locales: ["en"], strategy: "prefix" }, "/p"),
		).toThrow(/defaultLocale/);
	});

	it("query strategy: canonical self-references the variant when currentLocale is passed", () => {
		// A variant canonicalizing to another URL makes Google drop the cluster.
		const { canonical } = hreflangAlternates(
			{
				baseUrl,
				locales: ["en", "fr"],
				defaultLocale: "en",
				currentLocale: "fr",
			},
			"/about",
		);
		expect(canonical).toBe("https://acme.test/about?hl=fr");
	});

	it("query strategy: appends with & when the path already carries a query", () => {
		const { links } = hreflangAlternates(
			{ baseUrl, locales: ["en"] },
			"/list?page=2",
		);
		expect(links[0]?.href).toBe("https://acme.test/list?page=2&hl=en");
	});

	it("refuses paths that escape the site origin", () => {
		// https://site//evil.com/x puts "//evil.com/x" into req.nextUrl.pathname;
		// resolving it against the base would emit a poisoned canonical.
		expect(() =>
			hreflangAlternates({ baseUrl, locales: ["en"] }, "//evil.com/x"),
		).toThrow(/outside the site origin/);
		expect(() =>
			hreflangAlternates({ baseUrl, locales: ["en"] }, "/\\evil.com/x"),
		).toThrow(/outside the site origin/);
	});
});

describe("hreflangAlternates: canonical follows the address, not the language", () => {
	const config = { baseUrl, locales: ["en", "fr", "nl"], defaultLocale: "en" };

	it("query strategy: the default locale canonicalizes to its own param URL", () => {
		// The bare path is the negotiating entry point and belongs to no locale,
		// so ?hl=en must not canonicalize away to it — that deletes English from
		// the cluster while leaving the markup looking correct.
		const { canonical } = hreflangAlternates(
			{ ...config, currentLocale: "en" },
			"/pricing",
		);
		expect(canonical).toBe("https://acme.test/pricing?hl=en");
	});

	it("query strategy: a non-default locale canonicalizes to itself", () => {
		const { canonical } = hreflangAlternates(
			{ ...config, currentLocale: "fr" },
			"/pricing",
		);
		expect(canonical).toBe("https://acme.test/pricing?hl=fr");
	});

	it("query strategy: the bare negotiating path canonicalizes to itself", () => {
		// No currentLocale: the URL names no locale, whatever language rendered.
		const { canonical } = hreflangAlternates(config, "/pricing");
		expect(canonical).toBe("https://acme.test/pricing");
	});

	it("query strategy: x-default stays the bare path", () => {
		const { languages } = hreflangAlternates(
			{ ...config, currentLocale: "fr" },
			"/pricing",
		);
		expect(languages["x-default"]).toBe("https://acme.test/pricing");
		expect(languages.en).toBe("https://acme.test/pricing?hl=en");
	});

	it("prefix strategy: the default locale still canonicalizes to the bare path", () => {
		const { canonical } = hreflangAlternates(
			{ ...config, strategy: "prefix", currentLocale: "en" },
			"/pricing",
		);
		expect(canonical).toBe("https://acme.test/pricing");
	});

	it("prefix strategy with prefixDefaultLocale: canonical is the prefixed URL", () => {
		const { canonical } = hreflangAlternates(
			{
				...config,
				strategy: "prefix",
				prefixDefaultLocale: true,
				currentLocale: "en",
			},
			"/pricing",
		);
		expect(canonical).toBe("https://acme.test/en/pricing");
	});

	it("every advertised URL round-trips to itself as canonical", () => {
		const { links } = hreflangAlternates(config, "/pricing");
		for (const [index, locale] of config.locales.entries()) {
			const { canonical } = hreflangAlternates(
				{ ...config, currentLocale: locale },
				"/pricing",
			);
			expect(canonical).toBe(links[index]?.href);
		}
	});
});
