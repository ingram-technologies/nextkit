import { describe, expect, it } from "vitest";
import { createManifest, createRobots, createSitemap, SITE_ICONS } from "./routes.js";

const baseUrl = "https://acme.test";

describe("createSitemap", () => {
	it("resolves relative paths and defaults priority (1 for root, 0.7 otherwise)", () => {
		const map = createSitemap({ baseUrl, routes: ["/", "/pricing"] });
		expect(map).toEqual([
			{ url: "https://acme.test/", priority: 1 },
			{ url: "https://acme.test/pricing", priority: 0.7 },
		]);
	});

	it("passes absolute URLs through untouched", () => {
		const [entry] = createSitemap({
			baseUrl,
			routes: ["https://other.test/x"],
		});
		expect(entry?.url).toBe("https://other.test/x");
	});

	it("applies per-entry and default lastModified / changeFrequency / priority", () => {
		const when = new Date("2026-01-01T00:00:00.000Z");
		const map = createSitemap({
			baseUrl,
			lastModified: when,
			defaultChangeFrequency: "monthly",
			defaultPriority: 0.5,
			routes: ["/a", { path: "/b", changeFrequency: "daily", priority: 0.9 }],
		});
		expect(map[0]).toEqual({
			url: "https://acme.test/a",
			lastModified: when,
			changeFrequency: "monthly",
			priority: 0.5,
		});
		expect(map[1]).toMatchObject({
			changeFrequency: "daily",
			priority: 0.9,
		});
	});

	it("resolves per-locale language alternates against the base URL", () => {
		const [entry] = createSitemap({
			baseUrl,
			routes: [
				{
					path: "/about",
					languages: { en: "/about", fr: "/fr/about", "x-default": "/about" },
				},
			],
		});
		expect(entry?.alternates).toEqual({
			languages: {
				en: "https://acme.test/about",
				fr: "https://acme.test/fr/about",
				"x-default": "https://acme.test/about",
			},
		});
	});

	it("rejects a priority outside 0–1", () => {
		expect(() =>
			createSitemap({ baseUrl, routes: [{ path: "/a", priority: 7 }] }),
		).toThrow(RangeError);
		expect(() =>
			createSitemap({ baseUrl, routes: ["/a"], defaultPriority: -0.1 }),
		).toThrow(/priority/);
	});
});

describe("createRobots", () => {
	it("disallows everything on non-production hosts", () => {
		const robots = createRobots({ baseUrl, isProduction: false });
		expect(robots).toEqual({ rules: { userAgent: "*", disallow: "/" } });
	});

	it("allows prod, advertises the sitemap, and carries the disallow list", () => {
		const robots = createRobots({
			baseUrl,
			isProduction: true,
			disallow: ["/api/", "/login"],
		});
		expect(robots).toEqual({
			rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/login"] },
			sitemap: "https://acme.test/sitemap.xml",
		});
	});

	it("refuses to disallow /_next (blocking build assets breaks rendering)", () => {
		for (const path of ["/_next/", "/_next", "_next/static", " /_next/data"]) {
			expect(() =>
				createRobots({ baseUrl, isProduction: true, disallow: [path] }),
			).toThrow(/_next/);
		}
		// A legit prefix that merely starts with "/_" is fine.
		expect(() =>
			createRobots({ baseUrl, isProduction: true, disallow: ["/_preview"] }),
		).not.toThrow();
	});

	it("omits the sitemap when sitemapPath is null and drops an empty disallow", () => {
		const robots = createRobots({
			baseUrl,
			isProduction: true,
			sitemapPath: null,
		});
		expect(robots).toEqual({
			rules: { userAgent: "*", allow: "/" },
		});
	});
});

describe("createManifest", () => {
	it("fills a website's defaults around name and theme colour", () => {
		expect(
			createManifest({ name: "Acme Analytics", themeColor: "#0f172a" }),
		).toEqual({
			name: "Acme Analytics",
			short_name: "Acme Analytics",
			start_url: "/",
			display: "browser",
			background_color: "#ffffff",
			theme_color: "#0f172a",
			icons: SITE_ICONS,
		});
	});

	it("takes overrides and passes other manifest members through", () => {
		const manifest = createManifest({
			name: "Acme Analytics",
			shortName: "Acme",
			themeColor: "#0f172a",
			display: "standalone",
			icons: [{ src: "/logo.png", sizes: "512x512", type: "image/png" }],
			lang: "fr",
		});
		expect(manifest.short_name).toBe("Acme");
		expect(manifest.display).toBe("standalone");
		expect(manifest.icons).toHaveLength(1);
		expect(manifest.lang).toBe("fr");
	});
});
