import { describe, expect, it } from "vitest";
import { generateRss, type RssConfig } from "./rss.js";
import { postUrl } from "./seo.js";
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

const config: RssConfig = {
	title: "Blog & Co",
	siteUrl: "https://example.com",
	basePath: "/posts",
	feedUrl: "https://example.com/rss.xml",
};

// No XML parser is a dependency and the suite runs in node (no DOMParser), so
// read the feed structurally: pull each element's raw text, require it to be
// well-formed character data, then decode the five predefined entities.
const decode = (raw: string): string =>
	raw
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", '"')
		.replaceAll("&apos;", "'")
		.replaceAll("&amp;", "&");

const texts = (xml: string, tag: string): string[] =>
	[...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([^]*?)</${tag}>`, "g"))].map(
		(match) => {
			const raw = match[1] ?? "";
			// Character data may hold neither a raw `<` nor a bare `&`.
			expect(raw).not.toMatch(/<|&(?!(?:amp|lt|gt|quot|apos);)/);
			return decode(raw);
		},
	);

const items = (xml: string): string[] =>
	[...xml.matchAll(/<item>([^]*?)<\/item>/g)].map((match) => match[1] ?? "");

const only = (xml: string, tag: string): string | undefined => {
	const found = texts(xml, tag);
	expect(found).toHaveLength(1);
	return found[0];
};

describe("generateRss", () => {
	it("round-trips titles, links and metadata through XML escaping", () => {
		const xml = generateRss(config, [post]);
		const [item] = items(xml);
		if (item === undefined) throw new Error("no <item>");

		const url = postUrl(post, {
			baseUrl: config.siteUrl,
			basePath: config.basePath,
		});
		expect(only(item, "title")).toBe(post.title);
		expect(only(item, "description")).toBe(post.description);
		expect(only(item, "link")).toBe(url);
		expect(only(item, "guid")).toBe(url);
		expect(item).toMatch(/<guid isPermaLink="true">/);
		expect(texts(item, "dc:creator")).toEqual(post.authors);
		expect(only(item, "category")).toBe(post.category);
		expect(Date.parse(only(item, "pubDate") ?? "")).toBe(Date.parse(post.date));

		expect(texts(xml, "title")[0]).toBe(config.title);
	});

	it("strips XML-invalid control characters a strict parser would reject", () => {
		const xml = generateRss(config, [{ ...post, title: "Back\bspace\u0001" }]);
		const [item] = items(xml);
		expect(only(item ?? "", "title")).toBe("Backspace");
		// Nothing in C0 but tab/LF/CR survives anywhere in the document.
		// oxlint-disable-next-line no-control-regex -- asserting their absence is the point
		expect(xml).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/);
	});

	it("never joins a trailing-slash siteUrl into a `//` path", () => {
		const xml = generateRss({ ...config, siteUrl: "https://example.com/" }, [post]);
		const links = [...texts(xml, "link"), ...texts(xml, "guid")];
		expect(links).toEqual([
			"https://example.com/posts",
			"https://example.com/posts/a-b",
			"https://example.com/posts/a-b",
		]);
	});
});
