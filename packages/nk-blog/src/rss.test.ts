import { describe, expect, it } from "vitest";
import { generateRss } from "./rss.js";
import type { BlogPostPreview } from "./types.js";

const post: BlogPostPreview = {
	slug: "a-b",
	title: "Tom & Jerry <3",
	description: 'Quotes "and" angles <>',
	date: "2026-01-01T00:00:00.000Z",
	authors: ["A"],
	author: "A",
	category: "News",
	tags: [],
	draft: false,
	featured: false,
	format: "md",
	readingTimeMinutes: 1,
	readTime: "1 min read",
};

describe("generateRss", () => {
	it("produces an escaped RSS 2.0 document", () => {
		const xml = generateRss(
			{
				title: "Blog & Co",
				siteUrl: "https://example.com",
				basePath: "/posts",
				feedUrl: "https://example.com/rss.xml",
			},
			[post],
		);
		expect(xml).toContain("<title>Blog &amp; Co</title>");
		expect(xml).toContain("<title>Tom &amp; Jerry &lt;3</title>");
		expect(xml).toContain(
			'<guid isPermaLink="true">https://example.com/posts/a-b</guid>',
		);
		expect(xml).toContain("<pubDate>Thu, 01 Jan 2026 00:00:00 GMT</pubDate>");
		expect(xml).toContain("<dc:creator>A</dc:creator>");
		expect(xml).not.toContain("<3");
	});
});
