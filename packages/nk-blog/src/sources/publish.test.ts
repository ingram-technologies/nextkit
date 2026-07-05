import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import { serializePost } from "./publish.js";

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
