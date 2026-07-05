import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownBody, MdxBody, PostBody } from "./render.js";
import { unstyled } from "./unstyled/index.js";
import type { BlogPost } from "./types.js";

const post = (content: string, format: BlogPost["format"]): BlogPost => ({
	slug: "s",
	title: "T",
	description: "D",
	date: "2026-01-01T00:00:00.000Z",
	authors: [],
	author: "",
	tags: [],
	draft: false,
	featured: false,
	format,
	readingTimeMinutes: 1,
	readTime: "1 min read",
	content,
});

describe("MarkdownBody", () => {
	it("renders GFM through the element map", () => {
		const html = renderToStaticMarkup(
			<MarkdownBody
				content={"# Hi\n\n| a |\n| - |\n| 1 |"}
				elements={{
					h1: ({ children }) => <h1 data-styled>{children}</h1>,
				}}
			/>,
		);
		expect(html).toContain("<h1 data-styled");
		expect(html).toContain("<table>");
	});
});

describe("MdxBody", () => {
	it("renders vocabulary components in limited mode", async () => {
		const element = await MdxBody({
			content: '<Callout variant="tip">Careful</Callout>',
			components: unstyled,
		});
		const html = renderToStaticMarkup(element);
		expect(html).toContain('data-callout="tip"');
		expect(html).toContain("Careful");
	});

	it("rejects expressions in limited mode", async () => {
		await expect(
			MdxBody({ content: "{process.env.SECRET}", components: unstyled }),
		).rejects.toThrow(/not allowed in limited MDX/);
	});

	it("renders bespoke components with enforcement off", async () => {
		const element = await MdxBody({
			content: "<Chart />\n\n{1 + 1}",
			components: unstyled,
			bespoke: { Chart: () => <svg data-chart /> },
		});
		const html = renderToStaticMarkup(element);
		expect(html).toContain("data-chart");
		expect(html).toContain("2");
	});
});

describe("PostBody", () => {
	it("dispatches on format", async () => {
		const md = await PostBody({
			post: post("*hi*", "md"),
			components: unstyled,
		});
		expect(renderToStaticMarkup(md)).toContain("<em>hi</em>");

		const mdx = await PostBody({
			post: post('<YouTube id="abc" />', "mdx"),
			components: unstyled,
		});
		expect(renderToStaticMarkup(mdx)).toContain("youtube-nocookie.com/embed/abc");
	});
});
