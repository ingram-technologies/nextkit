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
	/**
	 * The blog's default language — the same value as `BlogConfig.defaultLang`.
	 * Its posts live at `basePath`; every other language's posts at
	 * `/<lang><basePath>` (`/fr/blog/<slug>`), matching nk-i18n's prefix
	 * strategy. Unset, no URL carries a language.
	 *
	 * The default language is deliberately unprefixed, unlike nk-i18n's
	 * negotiated pages: a post is one document in one language, not a page
	 * rendered per visitor, so it has exactly one address and there is no
	 * language-neutral bare URL to keep free.
	 */
	defaultLang?: string;
}

/** `/fr` for a non-default language, `""` for the default (or no language). */
const langPrefix = (lang: string | undefined, config: BlogSeoConfig): string =>
	config.defaultLang !== undefined &&
	lang !== undefined &&
	lang !== config.defaultLang
		? `/${lang}`
		: "";

/** Absolute URL of the blog index in `lang`: `/blog`, `/fr/blog`. */
export function blogIndexUrl(lang: string | undefined, config: BlogSeoConfig): string {
	return `${config.baseUrl}${langPrefix(lang, config)}${config.basePath}`;
}

/** Absolute URL of a post, prefixed by its language when that isn't the default. */
export function postUrl(post: BlogPostPreview, config: BlogSeoConfig): string {
	return `${blogIndexUrl(post.lang, config)}/${post.slug}`;
}

export interface BlogPostAlternates {
	/** The post's own address, or its `canonical` override. */
	canonical: string;
	/**
	 * hreflang → URL for every language version, plus `x-default` pointing at
	 * the default-language version when there is one. Empty for a post with no
	 * translation: a single-member cluster says nothing.
	 */
	languages: Record<string, string>;
}

/**
 * Canonical + hreflang alternates for a post, from `blog.translations(post)`.
 * Spread into Next's `Metadata.alternates`. A post links only to versions that
 * exist, so a French-only article never advertises an English URL.
 */
export function blogPostAlternates(
	post: BlogPostPreview,
	translations: readonly BlogPostPreview[],
	config: BlogSeoConfig,
): BlogPostAlternates {
	const canonical = toAbsoluteUrl(
		post.canonical ?? postUrl(post, config),
		config.baseUrl,
	);
	const versions = translations.filter((version) => version.lang !== undefined);
	if (versions.length < 2) return { canonical, languages: {} };

	const languages: Record<string, string> = {};
	for (const version of versions) {
		if (version.lang) languages[version.lang] = postUrl(version, config);
	}
	const fallback = versions.find((version) => version.lang === config.defaultLang);
	if (fallback) languages["x-default"] = postUrl(fallback, config);
	return { canonical, languages };
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
		...(post.lang ? { extra: { inLanguage: post.lang } } : {}),
		...overrides,
	});
}

/** Home → Blog → Post breadcrumb JSON-LD. */
export function blogPostBreadcrumbs(
	post: BlogPostPreview,
	config: BlogSeoConfig,
): WithContext<BreadcrumbListNode> {
	return breadcrumbList([
		{ name: "Home", url: `${config.baseUrl}${langPrefix(post.lang, config)}` },
		{ name: config.blogName ?? "Blog", url: blogIndexUrl(post.lang, config) },
		{ name: post.title, url: postUrl(post, config) },
	]);
}
