import { describe, expect, it } from "vitest";
import { VOCABULARY } from "./contract.js";
import { validateLimitedMdx } from "./limited-mdx.js";

const check = (source: string) => validateLimitedMdx(source, { allow: VOCABULARY });

/** Rejected *by the limited-MDX boundary*, not by an incidental parse error. */
const expectRejected = async (source: string, reason: RegExp) => {
	const result = await check(source);
	expect(result.ok).toBe(false);
	expect(result.errors[0]?.message).toMatch(reason);
};

const ESM = /import\/export statements are not allowed in limited MDX/;
const EXPRESSION = /\{…\} expressions are not allowed in limited MDX/;
const ATTRIBUTE_EXPRESSION = /attribute expressions are not allowed in limited MDX/;
const SPREAD = /uses a spread attribute; only literal props are allowed/;
const UNSAFE_URL = /scheme that is not allowed in limited MDX/;

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
		await expectRejected('import x from "y"\n\nhi', ESM);
		await expectRejected("export const x = 1\n\nhi", ESM);
	});

	it("rejects expressions", async () => {
		await expectRejected("Value: {process.env.SECRET}", EXPRESSION);
		await expectRejected("{(() => 1)()}", EXPRESSION);
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
		await expectRejected(
			"<Callout title={secret()} >x</Callout>",
			ATTRIBUTE_EXPRESSION,
		);
		await expectRejected("<Callout {...props}>x</Callout>", SPREAD);
	});

	it("reports syntax errors instead of throwing", async () => {
		const result = await check("<Callout>unclosed");
		expect(result.ok).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
	});

	it("rejects javascript:/data: URLs in HTML attributes", async () => {
		await expectRejected('<a href="javascript:alert(1)">x</a>', UNSAFE_URL);
		await expectRejected(
			'<img src="data:text/html,<script>1</script>" />',
			UNSAFE_URL,
		);
		// Browsers strip control chars when parsing, so this is javascript: too.
		await expectRejected('<a href="java\tscript:alert(1)">x</a>', UNSAFE_URL);
	});

	it("rejects javascript:/data: URLs in braced string-literal attributes", async () => {
		// A braced literal (`href={"javascript:…"}`) still compiles to a live URL,
		// so it must clear the same scheme guard as the plain-string form — the
		// `Literal` check alone used to wave it through.
		await expectRejected(
			'<a href={"javascript:alert(document.cookie)"}>x</a>',
			UNSAFE_URL,
		);
		await expectRejected('<Figure src={"data:text/html,x"} alt="x" />', UNSAFE_URL);
		// The same braced form with a safe URL is still accepted.
		expect((await check('<a href={"https://example.com"}>x</a>')).ok).toBe(true);
	});

	it("rejects javascript: URLs in plain markdown links and images", async () => {
		// The MDX pipeline has no urlTransform (unlike react-markdown), so a
		// markdown link compiles to a live anchor.
		await expectRejected("[x](javascript:alert(1))", UNSAFE_URL);
		await expectRejected("![x](javascript:alert(1))", UNSAFE_URL);
		await expectRejected("[x]: javascript:alert(1)", UNSAFE_URL);
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
