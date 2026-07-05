export type PostFormat = "md" | "mdx";

/** Everything a listing page needs — no body. */
export interface BlogPostPreview {
	slug: string;
	title: string;
	seoTitle?: string;
	description: string;
	/** ISO 8601. */
	date: string;
	/** ISO 8601; set when the post declares an `updated` date. */
	updated?: string;
	authors: string[];
	/** First author — convenience for single-byline layouts. */
	author: string;
	category?: string;
	tags: string[];
	image?: string;
	draft: boolean;
	featured: boolean;
	/** Reserved for i18n'd blogs; not interpreted by the reader yet. */
	lang?: string;
	/** Reserved canonical-URL override for syndicated posts. */
	canonical?: string;
	format: PostFormat;
	readingTimeMinutes: number;
	/** e.g. "5 min read" — derived from the body, never authored. */
	readTime: string;
}

/** A full post: the preview fields plus the body (frontmatter stripped). */
export interface BlogPost extends BlogPostPreview {
	content: string;
}
