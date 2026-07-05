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
