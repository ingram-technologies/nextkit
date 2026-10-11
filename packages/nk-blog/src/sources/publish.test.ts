import matter from "gray-matter";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { parsePost } from "../blog.js";
import { publishPost, serializePost } from "./publish.js";

describe("serializePost", () => {
	it("round-trips through the reader and re-serializes idempotently", () => {
		const frontmatter = {
			title: "T: a colon & more",
			description: "D",
			date: "2026-04-30",
			authors: ["A", "B"],
			tags: ["x"],
		};
		const out = serializePost(frontmatter, "\n\nHello **world**.\n\n");
		expect(out.endsWith(".\n")).toBe(true);

		const read = parsePost(
			{ name: "t.md", content: out },
			{ source: { load: () => Promise.resolve([]) } },
		);
		expect(read).toMatchObject({
			title: frontmatter.title,
			date: "2026-04-30T00:00:00.000Z",
			authors: frontmatter.authors,
			tags: frontmatter.tags,
			content: "Hello **world**.",
		});

		const { data, content } = matter(out);
		// Same keys back, so spreading `data` over the typed input replaces every
		// field with its parsed value: re-serializing the parsed file is a no-op.
		expect(Object.keys(data).sort()).toEqual(Object.keys(frontmatter).sort());
		expect(serializePost({ ...frontmatter, ...data }, content)).toBe(out);
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

describe("publishPost against the GitHub contents API", () => {
	const target = { owner: "o", repo: "r", dir: "content/posts/", token: "t" };
	const input = {
		slug: "a",
		frontmatter: { title: "T", description: "D", date: "2026-04-30" },
		body: "Hello.",
	};
	const putOk = {
		content: { path: "content/posts/a.md", sha: "new" },
		commit: { sha: "c1" },
	};
	const json = (body: unknown, status = 200) =>
		new Response(JSON.stringify(body), {
			status,
			headers: { "content-type": "application/json" },
		});

	/** Stubs global fetch with one response per call, in order. */
	const stubFetch = (...responses: Response[]) => {
		const queue = [...responses];
		const fetch = vi.fn((_url: string, _init?: RequestInit) => {
			const next = queue.shift();
			if (!next) throw new Error("unexpected fetch");
			return Promise.resolve(next);
		});
		vi.stubGlobal("fetch", fetch);
		return fetch;
	};
	const putBody = (fetch: ReturnType<typeof stubFetch>) => {
		const init = fetch.mock.calls[1]?.[1];
		expect(init?.method).toBe("PUT");
		return z
			.object({
				content: z.string(),
				sha: z.string().optional(),
				branch: z.string().optional(),
			})
			.parse(JSON.parse(String(init?.body)));
	};

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("refuses to clobber an existing post unless overwrite is set", async () => {
		const fetch = stubFetch(json({ sha: "old" }));
		await expect(publishPost(target, input)).rejects.toThrow(/already exists/);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("creates a new post without a sha, committing the serialized file", async () => {
		const fetch = stubFetch(json({ message: "Not Found" }, 404), json(putOk));
		await expect(publishPost(target, input)).resolves.toEqual(putOk);
		expect(fetch.mock.calls[1]?.[0]).toMatch(/\/contents\/content\/posts\/a\.md$/);
		const body = putBody(fetch);
		expect(body.sha).toBeUndefined();
		expect(Buffer.from(body.content, "base64").toString("utf8")).toBe(
			serializePost(input.frontmatter, input.body),
		);
	});

	it("sends the existing sha when overwriting", async () => {
		const fetch = stubFetch(json({ sha: "old" }), json(putOk));
		await publishPost(target, { ...input, overwrite: true });
		expect(putBody(fetch).sha).toBe("old");
	});

	it("surfaces a non-404 lookup failure instead of publishing", async () => {
		const fetch = stubFetch(new Response("boom", { status: 500 }));
		await expect(publishPost(target, input)).rejects.toThrow(
			/checking .*a\.md: 500/,
		);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("checks and commits on the requested branch", async () => {
		const fetch = stubFetch(json({}, 404), json(putOk));
		await publishPost(target, { ...input, branch: "preview/a" });
		expect(fetch.mock.calls[0]?.[0]).toMatch(/\?ref=preview%2Fa$/);
		expect(putBody(fetch).branch).toBe("preview/a");
	});
});
