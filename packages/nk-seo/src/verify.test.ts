import { defineLocaleRouting } from "@ingram-tech/nk-i18n";
import { describe, expect, it } from "vitest";
import { hreflangAlternates, type HreflangConfig } from "./alternates.js";
import { verifyHreflangCluster } from "./verify.js";

const routing = defineLocaleRouting({
	baseUrl: "https://acme.test",
	locales: ["en", "fr"],
	defaultLocale: "en",
});

// The integration guarantee: nk-i18n's routing definition IS a valid nk-seo
// hreflang config, so the URL a site serves and the URL it advertises are built
// from one object and cannot drift. If this stops compiling, the two packages
// have diverged and a site can be correct on one side while broken on the other.
const _routingIsHreflangConfig: HreflangConfig = routing;

/** Render a page the way a correctly-wired site would. */
const page = (
	pathname: string,
	urlLocale: string | undefined,
	overrides: { canonical?: string; alternates?: string[]; lang?: string } = {},
): string => {
	const { canonical, links } = hreflangAlternates(
		{ ...routing, currentLocale: urlLocale },
		pathname,
	);
	const hrefs = overrides.alternates ?? links.map((link) => link.href);
	return [
		`<html lang="${overrides.lang ?? urlLocale ?? routing.defaultLocale}">`,
		`<head><link rel="canonical" href="${overrides.canonical ?? canonical}"/>`,
		...hrefs.map(
			(href, i) =>
				`<link rel="alternate" hreflang="${links[i]?.hrefLang ?? "x"}" href="${href}"/>`,
		),
		"</head></html>",
	].join("");
};

/** A fetch stub over a URL → Response map. */
const serve = (routes: Record<string, Response | (() => Response)>) =>
	((url: string | URL | Request) => {
		const key = typeof url === "string" ? url : url.toString();
		const entry = routes[key];
		if (!entry) return Promise.resolve(new Response("nope", { status: 404 }));
		return Promise.resolve(typeof entry === "function" ? entry() : entry);
	}) as unknown as typeof globalThis.fetch;

const html = (body: string) =>
	new Response(body, { status: 200, headers: { "content-type": "text/html" } });

describe("verifyHreflangCluster", () => {
	it("passes a correctly served cluster", async () => {
		const problems = await verifyHreflangCluster(routing, ["/pricing"], {
			fetch: serve({
				"https://acme.test/pricing": html(page("/pricing", undefined)),
				"https://acme.test/pricing?hl=en": html(page("/pricing", "en")),
				"https://acme.test/pricing?hl=fr": html(page("/pricing", "fr")),
			}),
		});
		expect(problems).toEqual([]);
	});

	it("catches an advertised URL that redirects", async () => {
		const problems = await verifyHreflangCluster(routing, ["/pricing"], {
			fetch: serve({
				"https://acme.test/pricing": html(page("/pricing", undefined)),
				"https://acme.test/pricing?hl=en": html(page("/pricing", "en")),
				"https://acme.test/pricing?hl=fr": () =>
					new Response(null, {
						status: 307,
						headers: { location: "/pricing" },
					}),
			}),
		});
		expect(problems).toHaveLength(1);
		expect(problems[0]?.url).toBe("https://acme.test/pricing?hl=fr");
		expect(problems[0]?.problem).toMatch(/redirects \(307 → \/pricing\)/);
	});

	it("catches a variant that canonicalizes to the default language", async () => {
		const problems = await verifyHreflangCluster(routing, ["/pricing"], {
			fetch: serve({
				"https://acme.test/pricing": html(page("/pricing", undefined)),
				"https://acme.test/pricing?hl=en": html(page("/pricing", "en")),
				"https://acme.test/pricing?hl=fr": html(
					page("/pricing", "fr", { canonical: "https://acme.test/pricing" }),
				),
			}),
		});
		expect(problems).toHaveLength(1);
		expect(problems[0]?.problem).toMatch(/canonical points at/);
	});

	it("catches a non-reciprocal cluster", async () => {
		const problems = await verifyHreflangCluster(routing, ["/pricing"], {
			fetch: serve({
				"https://acme.test/pricing": html(page("/pricing", undefined)),
				"https://acme.test/pricing?hl=en": html(page("/pricing", "en")),
				"https://acme.test/pricing?hl=fr": html(
					page("/pricing", "fr", {
						alternates: ["https://acme.test/pricing?hl=fr"],
					}),
				),
			}),
		});
		expect(problems[0]?.problem).toMatch(/does not link back to/);
	});

	it("catches a variant whose html lang contradicts its hreflang", async () => {
		const problems = await verifyHreflangCluster(routing, ["/pricing"], {
			fetch: serve({
				"https://acme.test/pricing": html(page("/pricing", undefined)),
				"https://acme.test/pricing?hl=en": html(page("/pricing", "en")),
				"https://acme.test/pricing?hl=fr": html(
					page("/pricing", "fr", { lang: "en" }),
				),
			}),
		});
		expect(problems[0]?.problem).toMatch(/serves <html lang="en">/);
	});

	it("catches a page carrying two canonicals", async () => {
		const doubled = page("/pricing", "fr").replace(
			"<head>",
			'<head><link rel="canonical" href="https://acme.test/other"/>',
		);
		const problems = await verifyHreflangCluster(routing, ["/pricing"], {
			fetch: serve({
				"https://acme.test/pricing": html(page("/pricing", undefined)),
				"https://acme.test/pricing?hl=en": html(page("/pricing", "en")),
				"https://acme.test/pricing?hl=fr": html(doubled),
			}),
		});
		expect(problems[0]?.problem).toMatch(/2 <link rel=canonical> tags/);
	});
});
