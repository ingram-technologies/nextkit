import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import { publishPost, serializePost } from "./publish.js";

describe("serializePost", () => {
	it("emits parseable frontmatter + body with one trailing newline", () => {
		const out = serializePost(
			{
				title: "T",
				description: "D",
				date: "2026-04-30",
				author: "A",
				tags: ["x"],
			},
			"Hello **world**.",
		);
		expect(out.endsWith(".\n")).toBe(true);
		const { data, content } = matter(out);
		expect(data.title).toBe("T");
		expect(data.tags).toEqual(["x"]);
		expect(content.trim()).toBe("Hello **world**.");
	});

	it("refuses to serialize frontmatter the readers would reject", () => {
		expect(() => serializePost({ title: "T" } as never, "x")).toThrow();
	});
});

describe("publishPost input validation (throws before any network call)", () => {
	const target = { owner: "o", repo: "r", dir: "content/posts", token: "t" };
	const frontmatter = { title: "T", description: "D", date: "2026-04-30" };

	it("rejects a slug that would traverse the repo path", async () => {
		await expect(
			publishPost(target, {
				slug: "../.github/workflows/pwn",
				frontmatter,
				body: "x",
			}),
		).rejects.toThrow(/invalid slug/);
	});

	it("rejects a frontmatter slug that contradicts the publish slug", async () => {
		// The reader routes by the frontmatter override, so this would defeat
		// the filename collision check and break the target site's build.
		await expect(
			publishPost(target, {
				slug: "b",
				frontmatter: { ...frontmatter, slug: "a" },
				body: "x",
			}),
		).rejects.toThrow(/does not match publish slug/);
	});
});
