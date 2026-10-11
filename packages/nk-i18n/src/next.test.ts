import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	createLocaleResolver,
	getUrlLocale,
	hreflangConfigFor,
	LOCALE_URL_HEADER,
	localeProxy,
	PATHNAME_HEADER,
} from "./next.js";
import { defineLocaleRouting } from "./routing.js";

/** What `next/headers` hands a server component for the current request. */
const incoming = vi.hoisted(() => ({
	headers: new Headers(),
	cookies: new Map<string, string>(),
}));

vi.mock("next/headers", () => ({
	headers: async () => incoming.headers,
	cookies: async () => ({
		get: (name: string) => {
			const value = incoming.cookies.get(name);
			return value === undefined ? undefined : { name, value };
		},
	}),
}));

beforeEach(() => {
	incoming.headers = new Headers();
	incoming.cookies = new Map();
});

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

describe("server components: the URL header is the only source of currentLocale", () => {
	const regional = defineLocaleRouting({
		baseUrl: "https://acme.test",
		locales: ["en", "fr", "nl"],
		defaultLocale: "en",
		hrefLangTags: { en: "en-BE", fr: "fr-BE" },
	});

	it("takes currentLocale from the header middleware forwarded", async () => {
		incoming.headers.set(LOCALE_URL_HEADER, "fr");
		const config = await hreflangConfigFor(regional);
		expect(config.currentLocale).toBe("fr");
		// The regional tags come along, so the site builds no second config.
		expect(config.hrefLangTags).toEqual({ en: "en-BE", fr: "fr-BE" });
	});

	it("names no locale on the bare path, even for a visitor with a fr cookie", async () => {
		// The canonical follows the address: a bare path rendering French must
		// not claim to be the French URL.
		incoming.cookies.set("locale", "fr");
		expect((await hreflangConfigFor(regional)).currentLocale).toBeUndefined();
	});

	it("rejects a header value outside the locale list", async () => {
		incoming.headers.set(LOCALE_URL_HEADER, "de");
		expect(await getUrlLocale(regional)).toBeUndefined();
	});
});

describe("createLocaleResolver", () => {
	it("lets the URL header beat both the cookie and the account", async () => {
		incoming.headers.set(LOCALE_URL_HEADER, "fr");
		incoming.cookies.set("locale", "nl");
		const resolve = createLocaleResolver(query, { account: () => "nl" });
		expect(await resolve()).toBe("fr");
	});
});
