import { describe, expect, it } from "vitest";
import {
	blogIndexUrl,
	blogPostAlternates,
	blogPostArticle,
	blogPostBreadcrumbs,
	postUrl,
} from "./seo.js";
import type { BlogPostPreview } from "./types.js";

const post: BlogPostPreview = {
	slug: "hello",
	title: "Hello",
	description: "D",
	date: "2026-01-01T00:00:00.000Z",
	authors: ["A"],
	author: "A",
	tags: ["ai"],
	image: "/img/x.png",
	draft: false,
	featured: false,
	format: "md",
	readingTimeMinutes: 1,
	readTime: "1 min read",
};

const config = { baseUrl: "https://example.com", basePath: "/posts" };

describe("seo bridge", () => {
	it("builds BlogPosting JSON-LD with absolute URLs", () => {
		const node = blogPostArticle(post, config);
		expect(node["@type"]).toBe("BlogPosting");
		expect(node.url).toBe("https://example.com/posts/hello");
		expect(node.image).toBe("https://example.com/img/x.png");
		expect(node.author?.[0]?.name).toBe("A");
		expect(node.keywords).toEqual(["ai"]);
	});

	it("absolutizes a relative canonical override but leaves a cross-origin one", () => {
		// A relative canonical must not ship into JSON-LD unresolved...
		const relative = blogPostArticle({ ...post, canonical: "/elsewhere" }, config);
		expect(relative.url).toBe("https://example.com/elsewhere");
		// ...while a cross-origin syndication canonical passes through untouched.
		const syndicated = blogPostArticle(
			{ ...post, canonical: "https://other.example/orig" },
			config,
		);
		expect(syndicated.url).toBe("https://other.example/orig");
	});

	it("builds Home → Blog → Post breadcrumbs", () => {
		const node = blogPostBreadcrumbs(post, { ...config, blogName: "Posts" });
		expect(node.itemListElement.map((item) => item.name)).toEqual([
			"Home",
			"Posts",
			"Hello",
		]);
		expect(node.itemListElement[2]?.item).toBe("https://example.com/posts/hello");
	});
});

describe("multilingual seo", () => {
	const ml = { ...config, basePath: "/blog", defaultLang: "en" };
	const en: BlogPostPreview = {
		...post,
		slug: "what-is",
		lang: "en",
		translationKey: "what-is",
	};
	const fr: BlogPostPreview = {
		...post,
		slug: "cest-quoi",
		lang: "fr",
		translationKey: "what-is",
	};

	it("prefixes only non-default languages", () => {
		expect(postUrl(en, ml)).toBe("https://example.com/blog/what-is");
		expect(postUrl(fr, ml)).toBe("https://example.com/fr/blog/cest-quoi");
		expect(blogIndexUrl("fr", ml)).toBe("https://example.com/fr/blog");
		// Without defaultLang nothing is prefixed, whatever the post says.
		expect(postUrl(fr, { ...ml, defaultLang: undefined })).toBe(
			"https://example.com/blog/cest-quoi",
		);
	});

	it("links existing versions only, x-default on the default language", () => {
		expect(blogPostAlternates(fr, [en, fr], ml)).toEqual({
			canonical: "https://example.com/fr/blog/cest-quoi",
			languages: {
				en: "https://example.com/blog/what-is",
				fr: "https://example.com/fr/blog/cest-quoi",
				"x-default": "https://example.com/blog/what-is",
			},
		});
		expect(blogPostAlternates(fr, [fr], ml).languages).toEqual({});
	});

	it("marks the article language and localizes the crumbs", () => {
		expect(blogPostArticle(fr, ml)).toMatchObject({
			inLanguage: "fr",
			url: "https://example.com/fr/blog/cest-quoi",
		});
		expect(
			blogPostBreadcrumbs(fr, ml).itemListElement.map((item) => item.item),
		).toEqual([
			"https://example.com/fr",
			"https://example.com/fr/blog",
			"https://example.com/fr/blog/cest-quoi",
		]);
	});
});
