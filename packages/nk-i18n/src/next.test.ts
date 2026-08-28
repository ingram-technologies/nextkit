import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { LOCALE_URL_HEADER, localeProxy, PATHNAME_HEADER } from "./next.js";
import { defineLocaleRouting } from "./routing.js";

const prefixed = defineLocaleRouting({
	baseUrl: "https://acme.test",
	locales: ["en", "fr", "nl"],
	defaultLocale: "en",
	strategy: "prefix",
});

const query = defineLocaleRouting({
	baseUrl: "https://acme.test",
	locales: ["en", "fr", "nl"],
	defaultLocale: "en",
});

const request = (url: string, headers: Record<string, string> = {}) =>
	new NextRequest(new URL(url, "https://acme.test"), { headers });

/** The request headers the middleware forwarded, as the app would see them. */
const forwarded = (response: Response, name: string) =>
	response.headers.get("x-middleware-override-headers")?.includes(name)
		? response.headers.get(`x-middleware-request-${name}`)
		: null;

describe("localeProxy: prefix strategy", () => {
	it("rewrites a localized path to the bare route and forwards the locale", () => {
		const response = localeProxy(prefixed, request("/fr/about"));
		expect(response.headers.get("x-middleware-rewrite")).toBe(
			"https://acme.test/about",
		);
		expect(forwarded(response, LOCALE_URL_HEADER)).toBe("fr");
		expect(forwarded(response, PATHNAME_HEADER)).toBe("/fr/about");
	});

	it("keeps the query string across the rewrite", () => {
		const response = localeProxy(prefixed, request("/fr/search?q=vat"));
		expect(response.headers.get("x-middleware-rewrite")).toBe(
			"https://acme.test/search?q=vat",
		);
	});

	it("rewrites a bare locale root to /", () => {
		expect(
			localeProxy(prefixed, request("/fr")).headers.get("x-middleware-rewrite"),
		).toBe("https://acme.test/");
	});

	it("does not rewrite or claim a locale on the bare path", () => {
		const response = localeProxy(prefixed, request("/about"));
		expect(response.headers.get("x-middleware-rewrite")).toBeNull();
		expect(forwarded(response, LOCALE_URL_HEADER)).toBeNull();
	});

	it("never redirects: every advertised address answers in place", () => {
		for (const path of ["/en/about", "/fr/about", "/nl/about", "/about"]) {
			expect(localeProxy(prefixed, request(path)).status).toBe(200);
		}
	});
});

describe("localeProxy: query strategy", () => {
	it("forwards the locale without rewriting", () => {
		const response = localeProxy(query, request("/about?hl=fr"));
		expect(response.headers.get("x-middleware-rewrite")).toBeNull();
		expect(forwarded(response, LOCALE_URL_HEADER)).toBe("fr");
	});

	it("claims no locale on the bare path", () => {
		expect(
			forwarded(localeProxy(query, request("/about")), LOCALE_URL_HEADER),
		).toBeNull();
	});
});

describe("localeProxy: cookie and header hygiene", () => {
	it("remembers an explicit choice for later bare-path visits", () => {
		const response = localeProxy(query, request("/about?hl=nl"));
		expect(response.cookies.get("locale")?.value).toBe("nl");
	});

	it("uses the cookie name from routing, not a second source of truth", () => {
		const named = defineLocaleRouting({
			baseUrl: "https://acme.test",
			locales: ["en", "fr"],
			defaultLocale: "en",
			cookieName: "lang",
		});
		expect(
			localeProxy(named, request("/about?hl=fr")).cookies.get("lang")?.value,
		).toBe("fr");
	});

	it("writes no cookie when the URL named no locale", () => {
		expect(
			localeProxy(query, request("/about")).cookies.get("locale"),
		).toBeUndefined();
	});

	it("strips a client-supplied locale header instead of trusting it", () => {
		// The header is ours to mint; a client that sends its own must not reach
		// the app, or it can pick the language of a page it does not address.
		const response = localeProxy(
			query,
			request("/about", { [LOCALE_URL_HEADER]: "fr" }),
		);
		expect(forwarded(response, LOCALE_URL_HEADER)).toBeNull();
	});

	it("keeps headers the caller added of its own", () => {
		const requestHeaders = new Headers({ "x-tenant": "acme" });
		const response = localeProxy(query, request("/about?hl=fr"), {
			requestHeaders,
		});
		expect(forwarded(response, "x-tenant")).toBe("acme");
		expect(forwarded(response, LOCALE_URL_HEADER)).toBe("fr");
	});
});
