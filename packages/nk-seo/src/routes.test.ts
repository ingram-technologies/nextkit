import { describe, expect, it } from "vitest";
import { createRobots, createSitemap } from "./routes.js";

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
		expect(entry.url).toBe("https://other.test/x");
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
			host: "https://acme.test",
		});
	});

	it("omits the sitemap when sitemapPath is null and drops an empty disallow", () => {
		const robots = createRobots({
			baseUrl,
			isProduction: true,
			sitemapPath: null,
		});
		expect(robots).toEqual({
			rules: { userAgent: "*", allow: "/" },
			host: "https://acme.test",
		});
	});
});
