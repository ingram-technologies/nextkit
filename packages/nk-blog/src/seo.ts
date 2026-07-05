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

const absoluteImage = (image: string, baseUrl: string): string =>
	image.startsWith("/") ? `${baseUrl}${image}` : image;

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
		url: post.canonical ?? postUrl(post, config),
		datePublished: post.date,
		dateModified: post.updated,
		authors: post.authors.map((name) => ({ name })),
		image: post.image ? absoluteImage(post.image, config.baseUrl) : undefined,
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
