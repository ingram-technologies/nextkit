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
	 * Language of every post that declares no `lang`. Set it to make the blog
	 * multilingual: each post is written in one language, slugs are unique per
	 * language, and posts sharing a `translationKey` are one another's
	 * translations. Unset, `lang` is only what frontmatter says.
	 */
	defaultLang?: string;
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

/** Narrows a listing to one language. Omitted, every language is included. */
export interface LangFilter {
	lang?: string;
}

export interface Blog {
	/** All non-draft posts, newest first, with bodies. */
	posts(filter?: LangFilter): Promise<BlogPost[]>;
	/** All non-draft posts, newest first, without bodies. */
	previews(filter?: LangFilter): Promise<BlogPostPreview[]>;
	/**
	 * The post at `slug`. Slugs are unique per language, so pass `lang` on a
	 * multilingual blog; without it, the `defaultLang` post wins a shared slug.
	 */
	post(slug: string, filter?: LangFilter): Promise<BlogPost | null>;
	slugs(filter?: LangFilter): Promise<string[]>;
	/** The pinned (`featured: true`) post, else the newest. */
	featured(filter?: LangFilter): Promise<BlogPost | null>;
	/**
	 * Every language version of `post`, itself included, in `posts()` order —
	 * the input to `blogPostAlternates`. Drafts are excluded like everywhere
	 * else, so an unpublished translation is never advertised.
	 */
	translations(post: BlogPostPreview): Promise<BlogPostPreview[]>;
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
		lang: frontmatter.lang ?? config.defaultLang,
		translationKey: frontmatter.translationKey ?? slug,
		canonical: frontmatter.canonical,
		format: named.format,
		readingTimeMinutes: time.minutes,
		readTime: time.text,
		content: body,
	};
}

const inLang = (post: BlogPostPreview, filter?: LangFilter): boolean =>
	filter?.lang === undefined || post.lang === filter.lang;

export function createBlog(config: BlogConfig): Blog {
	const all = async (): Promise<BlogPost[]> => {
		const files = await config.source.load();
		const parsed = files
			.map((file) => parsePost(file, config))
			.filter((post): post is BlogPost => post !== null);

		// Collision checks BEFORE the draft filter: a draft colliding with a
		// live post must fail the production build too, not only draft-enabled
		// previews. Two files resolving to one address, or two posts claiming
		// to be the same translation, is a conflict — always a loud build
		// failure, never a quiet last-one-wins.
		const bySlug = new Map<string, BlogPost>();
		const byTranslation = new Map<string, BlogPost>();
		for (const post of parsed) {
			const where = post.lang === undefined ? "" : ` in lang "${post.lang}"`;
			const slugKey = `${post.lang ?? ""}\0${post.slug}`;
			if (bySlug.has(slugKey)) {
				throw new Error(`nk-blog: duplicate slug "${post.slug}"${where}`);
			}
			bySlug.set(slugKey, post);

			const translationKey = `${post.lang ?? ""}\0${post.translationKey}`;
			const claimed = byTranslation.get(translationKey);
			if (claimed) {
				throw new Error(
					`nk-blog: "${claimed.slug}" and "${post.slug}" are both the${where} version of translation "${post.translationKey}"`,
				);
			}
			byTranslation.set(translationKey, post);
		}

		return [...bySlug.values()]
			.filter((post) => config.drafts === true || !post.draft)
			.sort(
				(a, b) =>
					new Date(b.date).getTime() - new Date(a.date).getTime() ||
					// Same-day posts: deterministic order between builds.
					a.slug.localeCompare(b.slug) ||
					(a.lang ?? "").localeCompare(b.lang ?? ""),
			);
	};

	const posts = async (filter?: LangFilter): Promise<BlogPost[]> =>
		(await all()).filter((post) => inLang(post, filter));

	return {
		posts,
		previews: async (filter) =>
			(await posts(filter)).map(({ content: _content, ...preview }) => preview),
		post: async (slug, filter) => {
			const matches = (await posts(filter)).filter(
				(candidate) => candidate.slug === slug,
			);
			return (
				matches.find((candidate) => candidate.lang === config.defaultLang) ??
				matches[0] ??
				null
			);
		},
		slugs: async (filter) => (await posts(filter)).map((post) => post.slug),
		featured: async (filter) => {
			const listed = await posts(filter);
			return listed.find((post) => post.featured) ?? listed[0] ?? null;
		},
		translations: async (post) =>
			(await all())
				.filter(
					(candidate) =>
						(candidate.translationKey ?? candidate.slug) ===
						(post.translationKey ?? post.slug),
				)
				.map(({ content: _content, ...preview }) => preview),
	};
}
