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

	it("sets robots noindex (but follow, preserving link equity) when noIndex is true", () => {
		const meta = pageMetadata({
			title: "T",
			description: "D",
			path: "/p",
			noIndex: true,
		});
		expect(meta.robots).toEqual({ index: false, follow: true });
	});

	it("omits robots when noIndex is not set", () => {
		const meta = pageMetadata({ title: "T", description: "D", path: "/p" });
		expect(meta.robots).toBeUndefined();
	});

	it("sets metadataBase so Next can resolve any leftover relative URLs", () => {
		const meta = pageMetadata({ title: "T", description: "D", path: "/p" });
		expect(meta.metadataBase).toEqual(new URL("https://example.test"));
	});

	it("merges a per-page openGraph override (article type)", () => {
		const meta = pageMetadata({
			title: "Post",
			description: "D",
			path: "/blog/post",
			type: "article",
		});
		expect(meta.openGraph).toMatchObject({ type: "article" });
	});
});

describe("pageMetadata.root", () => {
	it("emits a plain default title when no template is configured", () => {
		const root = pageMetadata.root();
		expect(root.title).toBe("Acme");
		expect(root.metadataBase).toEqual(new URL("https://example.test"));
	});

	it("emits title.default + title.template when titleTemplate is configured", () => {
		const withTemplate = createMetadata({
			baseUrl: "https://example.test",
			siteName: "Acme",
			titleTemplate: "%s | Acme",
		});
		expect(withTemplate.root({ description: "About us" })).toMatchObject({
			title: { default: "Acme", template: "%s | Acme" },
			description: "About us",
		});
	});

	it("lets overrides win over the generated metadata", () => {
		const root = pageMetadata.root({ overrides: { title: "Custom" } });
		expect(root.title).toBe("Custom");
	});
});
