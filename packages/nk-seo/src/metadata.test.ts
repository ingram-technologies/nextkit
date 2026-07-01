import { describe, expect, it } from "vitest";
import { createMetadata } from "./metadata.js";

const pageMetadata = createMetadata({
	baseUrl: "https://example.test",
	siteName: "Acme",
	defaultImage: "/og.png",
	locale: "en_US",
	twitterSite: "@acme",
});

describe("createMetadata", () => {
	it("builds an absolute canonical and OG url from the path", () => {
		const meta = pageMetadata({
			title: "Services",
			description: "What we do",
			path: "/services",
		});
		expect(meta.alternates?.canonical).toBe("https://example.test/services");
		expect(meta.openGraph?.url).toBe("https://example.test/services");
		expect(meta.openGraph?.siteName).toBe("Acme");
	});

	it("resolves the default image to an absolute Twitter/OG image", () => {
		const meta = pageMetadata({ title: "T", description: "D", path: "/" });
		expect(meta.twitter).toMatchObject({
			card: "summary_large_image",
			site: "@acme",
			images: ["https://example.test/og.png"],
		});
	});

	it("lets a per-page image override the site default", () => {
		const meta = pageMetadata({
			title: "T",
			description: "D",
			path: "/p",
			image: "/custom.png",
		});
		expect(meta.twitter).toMatchObject({
			images: ["https://example.test/custom.png"],
		});
	});

	it("sets robots noindex/nofollow when noIndex is true", () => {
		const meta = pageMetadata({
			title: "T",
			description: "D",
			path: "/p",
			noIndex: true,
		});
		expect(meta.robots).toEqual({ index: false, follow: false });
	});

	it("omits robots when noIndex is not set", () => {
		const meta = pageMetadata({ title: "T", description: "D", path: "/p" });
		expect(meta.robots).toBeUndefined();
	});

	it("merges a per-page openGraph override (article type)", () => {
		const meta = pageMetadata({
			title: "Post",
			description: "D",
			path: "/blog/post",
			type: "article",
		});
		expect(meta.openGraph?.type).toBe("article");
	});
});
