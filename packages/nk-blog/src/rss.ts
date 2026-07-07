import type { BlogPostPreview } from "./types.js";

export interface RssConfig {
	title: string;
	description?: string;
	/** Absolute site origin, e.g. "https://example.com". */
	siteUrl: string;
	/** Path prefix of the blog, e.g. "/posts". */
	basePath: string;
	/** Absolute URL the feed is served from, e.g. `${siteUrl}/rss.xml`. */
	feedUrl: string;
	language?: string;
}

const escapeXml = (value: string): string =>
	value
		// XML 1.0 forbids most C0 controls even escaped — a stray \x08 pasted
		// into a title would make strict parsers reject the whole feed.
		// oxlint-disable-next-line no-control-regex -- stripping XML-invalid chars is the point
		.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");

/**
 * RSS 2.0 feed for a post list. Serve from a route handler (`rss.xml/route.ts`
 * with `export const dynamic = "force-static"`) so it renders at build.
 */
export function generateRss(config: RssConfig, posts: BlogPostPreview[]): string {
	const items = posts
		.map((post) => {
			const url = `${config.siteUrl}${config.basePath}/${post.slug}`;
			return [
				"\t\t<item>",
				`\t\t\t<title>${escapeXml(post.title)}</title>`,
				`\t\t\t<link>${escapeXml(url)}</link>`,
				`\t\t\t<guid isPermaLink="true">${escapeXml(url)}</guid>`,
				`\t\t\t<pubDate>${new Date(post.date).toUTCString()}</pubDate>`,
				`\t\t\t<description>${escapeXml(post.description)}</description>`,
				...post.authors.map(
					(author) => `\t\t\t<dc:creator>${escapeXml(author)}</dc:creator>`,
				),
				...(post.category
					? [`\t\t\t<category>${escapeXml(post.category)}</category>`]
					: []),
				"\t\t</item>",
			].join("\n");
		})
		.join("\n");

	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
		"\t<channel>",
		`\t\t<title>${escapeXml(config.title)}</title>`,
		`\t\t<link>${escapeXml(config.siteUrl + config.basePath)}</link>`,
		`\t\t<description>${escapeXml(config.description ?? config.title)}</description>`,
		`\t\t<language>${escapeXml(config.language ?? "en")}</language>`,
		`\t\t<atom:link href="${escapeXml(config.feedUrl)}" rel="self" type="application/rss+xml"/>`,
		...(posts[0]
			? [
					`\t\t<lastBuildDate>${new Date(posts[0].date).toUTCString()}</lastBuildDate>`,
				]
			: []),
		items,
		"\t</channel>",
		"</rss>",
		"",
	].join("\n");
}
