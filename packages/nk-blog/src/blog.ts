import matter from "gray-matter";
import { blogFrontmatterSchema } from "./schema.js";
import { DEFAULT_WORDS_PER_MINUTE, readingTime } from "./reading-time.js";
import type { BlogPost, BlogPostPreview, PostFormat } from "./types.js";

/** A content file, named relative to the content dir ("slug.md", "slug/index.mdx"). */
export interface RawPostFile {
	name: string;
	content: string;
}

export interface BlogSource {
	load(): Promise<RawPostFile[]>;
}

export interface BlogConfig {
	source: BlogSource;
	/** Byline when a post declares none (each site sets its own). */
	defaultAuthor?: string;
	defaultCategory?: string;
	wordsPerMinute?: number;
	/** Include drafts (listing pages typically pass `NODE_ENV !== "production"`). */
	drafts?: boolean;
	/**
	 * Site-specific image fallback (e.g. "look in /public/images/posts/<slug>").
	 * This is config precisely so per-site divergence never forks the reader.
	 */
	resolveImage?: (post: { slug: string; image?: string }) => string | undefined;
	/**
	 * "throw" (default) fails the build on malformed frontmatter — a real post
	 * silently missing from a site is worse than a red build. Remote sources
	 * (admin listing over GitHub) prefer "skip" to keep one bad file from
	 * hiding a whole target.
	 */
	onInvalid?: "throw" | "skip";
}

export interface Blog {
	/** All non-draft posts, newest first, with bodies. */
	posts(): Promise<BlogPost[]>;
	/** All non-draft posts, newest first, without bodies. */
	previews(): Promise<BlogPostPreview[]>;
	post(slug: string): Promise<BlogPost | null>;
	slugs(): Promise<string[]>;
	/** The pinned (`featured: true`) post, else the newest. */
	featured(): Promise<BlogPost | null>;
}

const POST_FILE = /^(?:(?<flat>[^/]+)|(?<dir>[^/]+)\/index)\.(?<ext>mdx?)$/;

interface ParsedName {
	slug: string;
	format: PostFormat;
	draftByName: boolean;
}

/** "slug.md", "slug.mdx", "slug/index.md(x)" → slug + format; else null. */
export function parsePostFileName(name: string): ParsedName | null {
	const match = POST_FILE.exec(name);
	const groups = match?.groups;
	if (!groups) return null;
	const base = groups.flat ?? groups.dir;
	if (!base) return null;
	return {
		slug: base.replace(/^_/, ""),
		format: groups.ext === "mdx" ? "mdx" : "md",
		// Legacy `_draft.md` convention, honored as an alias of `draft: true`.
		draftByName: base.startsWith("_"),
	};
}

export function parsePost(file: RawPostFile, config: BlogConfig): BlogPost | null {
	const named = parsePostFileName(file.name);
	if (!named) return null;

	const { data, content } = matter(file.content);
	const result = blogFrontmatterSchema.safeParse(data);
	if (!result.success) {
		if ((config.onInvalid ?? "throw") === "skip") {
			console.warn(
				`nk-blog: skipping ${file.name}: ${result.error.issues
					.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
					.join("; ")}`,
			);
			return null;
		}
		throw new Error(
			`nk-blog: invalid frontmatter in ${file.name}: ${result.error.issues
				.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
				.join("; ")}`,
		);
	}

	const frontmatter = result.data;
	const slug = frontmatter.slug ?? named.slug;
	const body = content.trim();
	const authors = frontmatter.authors.length
		? frontmatter.authors
		: config.defaultAuthor
			? [config.defaultAuthor]
			: [];
	const time = readingTime(body, config.wordsPerMinute ?? DEFAULT_WORDS_PER_MINUTE);
	const image =
		config.resolveImage?.({ slug, image: frontmatter.image }) ?? frontmatter.image;

	return {
		slug,
		title: frontmatter.title,
		seoTitle: frontmatter.seoTitle,
		description: frontmatter.description,
		date: frontmatter.date,
		updated: frontmatter.updated,
		authors,
		author: authors[0] ?? "",
		category: frontmatter.category ?? config.defaultCategory,
		tags: frontmatter.tags,
		image,
		draft: frontmatter.draft || named.draftByName,
		featured: frontmatter.featured,
		lang: frontmatter.lang,
		canonical: frontmatter.canonical,
		format: named.format,
		readingTimeMinutes: time.minutes,
		readTime: time.text,
		content: body,
	};
}

export function createBlog(config: BlogConfig): Blog {
	const posts = async (): Promise<BlogPost[]> => {
		const files = await config.source.load();
		const parsed = files
			.map((file) => parsePost(file, config))
			.filter((post): post is BlogPost => post !== null)
			.filter((post) => config.drafts === true || !post.draft);

		const seen = new Map<string, BlogPost>();
		for (const post of parsed) {
			if (seen.has(post.slug)) {
				// Two files resolving to one slug is a routing conflict — always
				// a loud build failure, never a quiet last-one-wins.
				throw new Error(`nk-blog: duplicate slug "${post.slug}"`);
			}
			seen.set(post.slug, post);
		}

		return [...seen.values()].sort(
			(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
		);
	};

	return {
		posts,
		previews: async () =>
			(await posts()).map(({ content: _content, ...preview }) => preview),
		post: async (slug) =>
			(await posts()).find((candidate) => candidate.slug === slug) ?? null,
		slugs: async () => (await posts()).map((post) => post.slug),
		featured: async () => {
			const all = await posts();
			return all.find((post) => post.featured) ?? all[0] ?? null;
		},
	};
}
