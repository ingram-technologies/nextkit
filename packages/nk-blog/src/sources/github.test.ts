import { afterEach, describe, expect, it, vi } from "vitest";
import { githubSource } from "./github.js";

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});

const blob = (text: string) => ({
	content: Buffer.from(text, "utf8").toString("base64"),
	encoding: "base64",
});

/** A fake GitHub: one tree, and a blob per sha. */
const stubGitHub = (
	tree: { path: string; type: string; sha: string }[],
	truncated = false,
) =>
	vi.stubGlobal(
		"fetch",
		vi.fn((url: string) => {
			if (url.includes("/git/trees/"))
				return Promise.resolve(json({ tree, truncated }));
			const sha = url.split("/git/blobs/")[1];
			return Promise.resolve(
				sha
					? json(blob(`body of ${sha}`))
					: json({ message: "Not Found" }, 404),
			);
		}),
	);

const config = { owner: "o", repo: "r", dir: "content/blog", token: "t" };

describe("githubSource", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("loads only post files under dir, named relative to it", async () => {
		stubGitHub([
			{ path: "content/blog", type: "tree", sha: "d" },
			{ path: "content/blog/a.md", type: "blob", sha: "a" },
			{ path: "content/blog/b/index.mdx", type: "blob", sha: "b" },
			{ path: "content/blog/notes.txt", type: "blob", sha: "n" },
			// Shares the string prefix but is a different directory.
			{ path: "content/blog-old/x.md", type: "blob", sha: "x" },
			{ path: "other/c.md", type: "blob", sha: "c" },
		]);
		for (const dir of ["content/blog", "content/blog/"]) {
			const files = await githubSource({ ...config, dir }).load();
			expect(files).toEqual([
				{ name: "a.md", content: "body of a" },
				{ name: "b/index.mdx", content: "body of b" },
			]);
		}
	});

	it("refuses a truncated tree rather than silently dropping posts", async () => {
		stubGitHub([{ path: "content/blog/a.md", type: "blob", sha: "a" }], true);
		await expect(githubSource(config).load()).rejects.toThrow(/truncated/);
	});
});
