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
});
