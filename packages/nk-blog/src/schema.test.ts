import { describe, expect, it } from "vitest";
import { blogFrontmatterSchema } from "./schema.js";

const base = { title: "T", description: "D", date: "2026-04-30" };

describe("blogFrontmatterSchema", () => {
	it("normalizes dates to ISO, accepting YAML Date objects", () => {
		expect(blogFrontmatterSchema.parse(base).date).toBe("2026-04-30T00:00:00.000Z");
		expect(
			blogFrontmatterSchema.parse({ ...base, date: new Date("2026-04-30") }).date,
		).toBe("2026-04-30T00:00:00.000Z");
	});

	it("rejects invalid dates", () => {
		expect(() =>
			blogFrontmatterSchema.parse({ ...base, date: "not a date" }),
		).toThrow(/Invalid date/);
	});

	it("collapses author/authors into authors[]", () => {
		expect(blogFrontmatterSchema.parse(base).authors).toEqual([]);
		expect(blogFrontmatterSchema.parse({ ...base, author: "A" }).authors).toEqual([
			"A",
		]);
		expect(
			blogFrontmatterSchema.parse({ ...base, author: ["A", "B"] }).authors,
		).toEqual(["A", "B"]);
		expect(
			blogFrontmatterSchema.parse({ ...base, authors: ["C"], author: "A" })
				.authors,
		).toEqual(["C"]);
	});

	it("aliases coverImage to image", () => {
		expect(
			blogFrontmatterSchema.parse({ ...base, coverImage: "/x.png" }).image,
		).toBe("/x.png");
		expect(
			blogFrontmatterSchema.parse({
				...base,
				image: "/a.png",
				coverImage: "/b.png",
			}).image,
		).toBe("/a.png");
	});

	it("defaults draft/featured/tags", () => {
		const parsed = blogFrontmatterSchema.parse(base);
		expect(parsed.draft).toBe(false);
		expect(parsed.featured).toBe(false);
		expect(parsed.tags).toEqual([]);
	});
});

describe("slug validation", () => {
	const base = { title: "T", description: "D", date: "2026-04-30" };

	it("accepts conventional slugs", () => {
		for (const slug of ["hello-world", "a", "v1.2", "snake_case-mix.ok"]) {
			expect(blogFrontmatterSchema.safeParse({ ...base, slug }).success).toBe(
				true,
			);
		}
	});

	it("rejects slugs that would break routes or traverse paths", () => {
		for (const slug of [
			"../evil.js",
			"a/b",
			"a b",
			"UPPER",
			"trailing-",
			".hidden",
			"a..b",
		]) {
			expect(blogFrontmatterSchema.safeParse({ ...base, slug }).success).toBe(
				false,
			);
		}
	});
});
