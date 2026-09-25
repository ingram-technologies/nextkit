import { describe, expect, it } from "vitest";
import { createBlog, parsePostFileName, type RawPostFile } from "./blog.js";

const file = (name: string, fm: string, body = "Hello world."): RawPostFile => ({
	name,
	content: `---\n${fm}\n---\n\n${body}\n`,
});

const post = (name: string, extra = "", body?: string): RawPostFile =>
	file(name, `title: T\ndescription: D\ndate: 2026-01-02\n${extra}`, body);

const memory = (...files: RawPostFile[]) => ({
	load: () => Promise.resolve(files),
});

describe("parsePostFileName", () => {
	it("handles flat files, folders, and the _draft alias", () => {
		expect(parsePostFileName("a.md")).toEqual({
			slug: "a",
			format: "md",
			draftByName: false,
		});
		expect(parsePostFileName("a/index.mdx")).toEqual({
			slug: "a",
			format: "mdx",
			draftByName: false,
		});
		expect(parsePostFileName("_wip.md")?.draftByName).toBe(true);
		expect(parsePostFileName("notes.txt")).toBeNull();
		expect(parsePostFileName("a/b/index.md")).toBeNull();
	});
});

describe("createBlog", () => {
	it("lists newest-first with derived fields", async () => {
		const blog = createBlog({
			source: memory(
				post("old.md"),
				file("new.md", "title: N\ndescription: D\ndate: 2026-06-01"),
			),
			defaultAuthor: "Team",
		});
		const posts = await blog.posts();
		expect(posts.map((p) => p.slug)).toEqual(["new", "old"]);
		expect(posts[0]?.author).toBe("Team");
		expect(posts[0]?.readTime).toBe("1 min read");
		expect(posts[0]?.format).toBe("md");
	});

	it("excludes drafts unless asked, honoring the _ alias", async () => {
		const files = [post("a.md"), post("b.md", "draft: true"), post("_c.md")];
		expect(await createBlog({ source: memory(...files) }).slugs()).toEqual(["a"]);
		expect(
			await createBlog({ source: memory(...files), drafts: true }).slugs(),
		).toHaveLength(3);
	});

	it("throws on duplicate slugs", async () => {
		const blog = createBlog({
			source: memory(post("a.md"), post("b.md", "slug: a")),
		});
		await expect(blog.posts()).rejects.toThrow(/duplicate slug "a"/);
	});

	it("throws on invalid frontmatter by default, skips when configured", async () => {
		const bad = file("bad.md", "title: X");
		await expect(createBlog({ source: memory(bad) }).posts()).rejects.toThrow(
			/invalid frontmatter in bad.md/,
		);
		expect(
			await createBlog({ source: memory(bad), onInvalid: "skip" }).posts(),
		).toEqual([]);
	});

	it("applies the site image resolver over frontmatter", async () => {
		const blog = createBlog({
			source: memory(post("a.md", "image: /fm.png")),
			resolveImage: ({ slug }) => `/images/posts/${slug}.webp`,
		});
		expect((await blog.post("a"))?.image).toBe("/images/posts/a.webp");
	});

	it("featured() prefers the pinned post over the newest", async () => {
		const blog = createBlog({
			source: memory(
				file("new.md", "title: N\ndescription: D\ndate: 2026-06-01"),
				post("pinned.md", "featured: true"),
			),
		});
		expect((await blog.featured())?.slug).toBe("pinned");
	});
});

describe("multilingual blogs", () => {
	const files = [
		post("what-is.md"),
		post("cest-quoi.md", "lang: fr\ntranslationKey: what-is"),
		post("fr-only.md", "lang: fr"),
		post("shared.md"),
		post("shared.fr.md", "lang: fr\nslug: shared"),
	];
	const blog = createBlog({ source: memory(...files), defaultLang: "en" });

	it("gives unmarked posts the default language and filters by lang", async () => {
		expect((await blog.post("what-is"))?.lang).toBe("en");
		expect((await blog.slugs({ lang: "fr" })).sort()).toEqual([
			"cest-quoi",
			"fr-only",
			"shared",
		]);
		expect((await blog.slugs({ lang: "en" })).sort()).toEqual([
			"shared",
			"what-is",
		]);
		expect(await blog.slugs()).toHaveLength(5);
	});

	it("keeps slugs unique per language, the default winning an unfiltered lookup", async () => {
		expect((await blog.post("shared"))?.lang).toBe("en");
		expect((await blog.post("shared", { lang: "fr" }))?.lang).toBe("fr");
		expect(await blog.post("fr-only", { lang: "en" })).toBeNull();
	});

	it("groups translations by translationKey, defaulting to the slug", async () => {
		const english = await blog.post("what-is");
		if (!english) throw new Error("missing fixture");
		const versions = await blog.translations(english);
		expect(versions.map((v) => `${v.lang}:${v.slug}`).sort()).toEqual([
			"en:what-is",
			"fr:cest-quoi",
		]);

		const shared = await blog.post("shared", { lang: "fr" });
		if (!shared) throw new Error("missing fixture");
		expect(await blog.translations(shared)).toHaveLength(2);

		const alone = await blog.post("fr-only");
		if (!alone) throw new Error("missing fixture");
		expect(await blog.translations(alone)).toHaveLength(1);
	});

	it("never advertises a draft translation", async () => {
		const withDraft = createBlog({
			source: memory(
				post("a.md"),
				post("a-fr.md", "lang: fr\ntranslationKey: a\ndraft: true"),
			),
			defaultLang: "en",
		});
		const english = await withDraft.post("a");
		if (!english) throw new Error("missing fixture");
		expect(await withDraft.translations(english)).toHaveLength(1);
	});

	it("fails the build on a slug or translation claimed twice in one language", async () => {
		await expect(
			createBlog({
				source: memory(
					post("a.md", "lang: fr"),
					post("b.md", "lang: fr\nslug: a"),
				),
			}).posts(),
		).rejects.toThrow(/duplicate slug "a" in lang "fr"/);
		await expect(
			createBlog({
				source: memory(
					post("a.md"),
					post("b.md", "lang: fr\ntranslationKey: a"),
					post("c.md", "lang: fr\ntranslationKey: a"),
				),
				defaultLang: "en",
			}).posts(),
		).rejects.toThrow(
			/"b" and "c" are both the in lang "fr" version of translation "a"/,
		);
	});

	it("leaves lang unset on a single-language blog", async () => {
		expect(
			(await createBlog({ source: memory(post("a.md")) }).post("a"))?.lang,
		).toBeUndefined();
	});
});
