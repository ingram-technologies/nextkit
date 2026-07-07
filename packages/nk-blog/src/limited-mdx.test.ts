import { describe, expect, it } from "vitest";
import { VOCABULARY } from "./contract.js";
import { validateLimitedMdx } from "./limited-mdx.js";

const check = (source: string) => validateLimitedMdx(source, { allow: VOCABULARY });

describe("validateLimitedMdx", () => {
	it("accepts prose, GFM, fragments, and vocabulary with literal props", async () => {
		const result = await check(
			[
				"---",
				"title: T",
				"---",
				"# Hi",
				"",
				"| a | b |",
				"| - | - |",
				"| 1 | 2 |",
				"",
				"<>",
				'<Callout variant="tip" title="Note this">Body</Callout>',
				"</>",
				"",
				'<YouTube id="abc" start={30} />',
				"",
				'<Figure src="/x.png" alt="x" />',
			].join("\n"),
		);
		expect(result.errors).toEqual([]);
		expect(result.ok).toBe(true);
	});

	it("rejects ESM", async () => {
		expect((await check('import x from "y"\n\nhi')).ok).toBe(false);
		expect((await check("export const x = 1\n\nhi")).ok).toBe(false);
	});

	it("rejects expressions", async () => {
		expect((await check("Value: {process.env.SECRET}")).ok).toBe(false);
		expect((await check("{(() => 1)()}")).ok).toBe(false);
	});

	it("rejects components outside the vocabulary", async () => {
		const result = await check('<Chart data="x" />');
		expect(result.ok).toBe(false);
		expect(result.errors[0]?.message).toMatch(/not in this blog's component/);
	});

	it("rejects miscased vocabulary as unknown HTML", async () => {
		const result = await check("<callout>hi</callout>");
		expect(result.ok).toBe(false);
		expect(result.errors[0]?.message).toMatch(/miscased/);
	});

	it("rejects non-literal and spread attributes", async () => {
		expect((await check("<Callout title={secret()} >x</Callout>")).ok).toBe(false);
		expect((await check("<Callout {...props}>x</Callout>")).ok).toBe(false);
	});

	it("reports syntax errors instead of throwing", async () => {
		const result = await check("<Callout>unclosed");
		expect(result.ok).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
	});

	it("rejects javascript:/data: URLs in HTML attributes", async () => {
		expect((await check('<a href="javascript:alert(1)">x</a>')).ok).toBe(false);
		expect(
			(await check('<img src="data:text/html,<script>1</script>" />')).ok,
		).toBe(false);
		// Browsers strip control chars when parsing, so this is javascript: too.
		expect((await check('<a href="java\tscript:alert(1)">x</a>')).ok).toBe(false);
	});

	it("rejects javascript: URLs in plain markdown links and images", async () => {
		// The MDX pipeline has no urlTransform (unlike react-markdown), so a
		// markdown link compiles to a live anchor.
		expect((await check("[x](javascript:alert(1))")).ok).toBe(false);
		expect((await check("![x](javascript:alert(1))")).ok).toBe(false);
		expect((await check("[x]: javascript:alert(1)")).ok).toBe(false);
	});

	it("accepts http(s)/mailto/relative URLs everywhere", async () => {
		const result = await check(
			[
				'<a href="https://example.com">x</a>',
				'<a href="/local#anchor">y</a>',
				'<a href="mailto:hi@example.com">z</a>',
				"",
				"[ok](https://example.com) and [rel](../up) and [anchor](#top)",
			].join("\n"),
		);
		expect(result.errors).toEqual([]);
		expect(result.ok).toBe(true);
	});
});
