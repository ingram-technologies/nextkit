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

	it("prefix strategy: the root path gets bare locale prefixes", () => {
		const { links } = hreflangAlternates(
			{ baseUrl, locales: ["en", "fr"], strategy: "prefix" },
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
			},
			"/about",
		);
		expect(canonical).toBe("https://acme.test/about");
		expect(links[1]?.href).toBe("https://acme.test/fr/about");
	});

	it("query strategy: canonical self-references the variant when currentLocale is passed", () => {
		// A variant canonicalizing to another URL makes Google drop the cluster.
		const { canonical } = hreflangAlternates(
			{
				baseUrl,
				locales: ["en", "fr"],
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

describe("hreflangAlternates: prefix strategy", () => {
	const config = {
		baseUrl,
		locales: ["en", "fr", "nl"],
		strategy: "prefix" as const,
	};

	it("gives every locale its own prefix, the default included", () => {
		// The bare path belongs to no locale, so `en` does NOT get it.
		const { links } = hreflangAlternates(config, "/about");
		expect(links).toEqual([
			{ hrefLang: "en", href: "https://acme.test/en/about" },
			{ hrefLang: "fr", href: "https://acme.test/fr/about" },
			{ hrefLang: "nl", href: "https://acme.test/nl/about" },
			{ hrefLang: "x-default", href: "https://acme.test/about" },
		]);
	});

	it("points x-default at the bare negotiating path", () => {
		const { languages } = hreflangAlternates(config, "/about");
		expect(languages["x-default"]).toBe("https://acme.test/about");
	});

	it("strips an existing locale prefix instead of double-prefixing", () => {
		const { links, canonical } = hreflangAlternates(config, "/fr/about");
		expect(links[1]?.href).toBe("https://acme.test/fr/about");
		expect(links[0]?.href).toBe("https://acme.test/en/about");
		// The locale is detected from the path, so the canonical self-references.
		expect(canonical).toBe("https://acme.test/fr/about");
	});

	it("prefixes the root path without a trailing slash", () => {
		const { links } = hreflangAlternates(config, "/");
		expect(links[0]?.href).toBe("https://acme.test/en");
		expect(links[3]?.href).toBe("https://acme.test/");
	});

	it("canonicalizes a bare path to itself, naming no locale", () => {
		expect(hreflangAlternates(config, "/about").canonical).toBe(
			"https://acme.test/about",
		);
	});

	it("emits the same cluster shape as the query strategy", () => {
		// The encoding differs; the shape must not. Both give every locale its own
		// address and reserve the bare path for x-default.
		const asQuery = hreflangAlternates(
			{ baseUrl, locales: config.locales },
			"/about",
		);
		const asPrefix = hreflangAlternates(config, "/about");
		expect(asPrefix.links.map((l) => l.hrefLang)).toEqual(
			asQuery.links.map((l) => l.hrefLang),
		);
		expect(asPrefix.languages["x-default"]).toBe(asQuery.languages["x-default"]);
	});

	it("exposes the links keyed by hreflang for Metadata.alternates.languages", () => {
		const { languages } = hreflangAlternates(
			{ ...config, hrefLangTags: { en: "en-BE", fr: "fr-BE", nl: "nl-BE" } },
			"/about",
		);
		expect(languages).toEqual({
			"en-BE": "https://acme.test/en/about",
			"fr-BE": "https://acme.test/fr/about",
			"nl-BE": "https://acme.test/nl/about",
			"x-default": "https://acme.test/about",
		});
	});
});

describe("hreflangAlternates: canonical follows the address, not the language", () => {
	const config = { baseUrl, locales: ["en", "fr", "nl"] };

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
