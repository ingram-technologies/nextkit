import { describe, expect, it } from "vitest";
import { blogPostArticle, blogPostBreadcrumbs } from "./seo.js";
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
