import {
	article,
	type ArticleInput,
	type ArticleNode,
	breadcrumbList,
	type BreadcrumbListNode,
	type OrganizationInput,
	type WithContext,
} from "@ingram-tech/nk-seo";
import type { BlogPostPreview } from "./types.js";

export interface BlogSeoConfig {
	/** Absolute site origin, e.g. "https://example.com". */
	baseUrl: string;
	/** Path prefix of the blog, e.g. "/posts" or "/blog". */
	basePath: string;
	/** Injected as the article publisher when provided. */
	publisher?: OrganizationInput;
	/** Crumb label for the blog index; defaults to "Blog". */
	blogName?: string;
}

export function postUrl(post: BlogPostPreview, config: BlogSeoConfig): string {
	return `${config.baseUrl}${config.basePath}/${post.slug}`;
}

// JSON-LD consumers don't resolve relative URLs, so anything without a scheme
// (leading-`/` or bare `img/x.png`) is absolutized against the site. Unlike
// nk-seo's `absoluteUrl`, an already-absolute value passes through untouched
// rather than being origin-checked: a post's image can live on a CDN and its
// `canonical` can be a cross-origin syndication override, both legitimately
// off-origin — so this must not throw the way the canonical-link resolver does.
const toAbsoluteUrl = (url: string, baseUrl: string): string =>
	/^https?:\/\//.test(url)
		? url
		: `${baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;

/** BlogPosting JSON-LD for a post — the nk-seo bridge. */
export function blogPostArticle(
	post: BlogPostPreview,
	config: BlogSeoConfig,
	overrides: Partial<ArticleInput> = {},
): WithContext<ArticleNode> {
	return article({
		type: "BlogPosting",
		headline: post.title,
		description: post.description,
		url: toAbsoluteUrl(post.canonical ?? postUrl(post, config), config.baseUrl),
		datePublished: post.date,
		dateModified: post.updated,
		authors: post.authors.map((name) => ({ name })),
		image: post.image ? toAbsoluteUrl(post.image, config.baseUrl) : undefined,
		keywords: post.tags.length ? post.tags : undefined,
		publisher: config.publisher,
		...overrides,
	});
}

/** Home → Blog → Post breadcrumb JSON-LD. */
export function blogPostBreadcrumbs(
	post: BlogPostPreview,
	config: BlogSeoConfig,
): WithContext<BreadcrumbListNode> {
	return breadcrumbList([
		{ name: "Home", url: config.baseUrl },
		{ name: config.blogName ?? "Blog", url: `${config.baseUrl}${config.basePath}` },
		{ name: post.title, url: postUrl(post, config) },
	]);
}
