import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lint as lintRule, ruleIds } from "./oxlint-harness.js";

const RULE = "nextkit/satori-css";

/** Lints `source` at `filename`; the rule keys off both path and imports. */
const lint = (filename, source) => lintRule("satori-css", source, { filename });

const OG_IMPORT = `import { ImageResponse } from "next/og";\n`;

describe("satori-css", () => {
	it("flags each style property satori silently drops, by name", () => {
		const out = lint(
			"lib/card.tsx",
			`${OG_IMPORT}export const card = () =>
				new ImageResponse(<div style={{ display: "flex", transition: "all 1s", backdropFilter: "blur(4px)" }} />);`,
		);
		expect(ruleIds(out)).toEqual([RULE, RULE]);
		expect(out[0].message).toContain("`transition`");
		expect(out[1].message).toContain("`backdropFilter`");
	});

	it("accepts the properties satori does implement, including kebab-case keys and CSS variables", () => {
		const out = lint(
			"lib/card.tsx",
			`${OG_IMPORT}export const card = () =>
				new ImageResponse(
					<div style={{ display: "flex", padding: 48, "--accent": "#fff", boxShadow: "0 0 1px #000", WebkitTextStrokeColor: "#000", "background-clip": "text" }} />,
				);`,
		);
		expect(out).toEqual([]);
	});

	it("flags calc() on a supported property and names the property", () => {
		const out = lint(
			"lib/card.tsx",
			`${OG_IMPORT}export const card = () =>
				new ImageResponse(<div style={{ display: "flex", width: "calc(100% - 20px)" }} />);`,
		);
		expect(ruleIds(out)).toEqual([RULE]);
		expect(out[0].message).toContain("`width`");
		expect(out[0].message).toContain("calc()");
	});

	it("flags a multi-child element that never declares display, with its child count", () => {
		const out = lint(
			"lib/card.tsx",
			`${OG_IMPORT}export const card = () =>
				new ImageResponse(
					<div>
						<span style={{ display: "flex" }} />
						<span style={{ display: "flex" }} />
						<span style={{ display: "flex" }} />
					</div>,
				);`,
		);
		expect(ruleIds(out)).toEqual([RULE]);
		expect(out[0].message).toMatch(/\b3\b/);
		expect(out[0].message).toContain("`display`");
	});

	it("accepts a single-child element with no display", () => {
		const out = lint(
			"lib/card.tsx",
			`${OG_IMPORT}export const card = () =>
				new ImageResponse(<div><span style={{ display: "flex" }} /></div>);`,
		);
		expect(out).toEqual([]);
	});

	it("flags text mixed with element siblings once", () => {
		// The parent declares display, so this is the text rule alone.
		const out = lint(
			"lib/card.tsx",
			`${OG_IMPORT}export const card = () =>
				new ImageResponse(
					<div style={{ display: "flex" }}>
						Ship faster
						<span style={{ display: "flex" }} />
					</div>,
				);`,
		);
		expect(ruleIds(out)).toEqual([RULE]);
	});

	it("leaves conditional children alone — they may collapse to nothing", () => {
		// nk-seo's own template is built this way; counting a `{cond ? <a/> :
		// null}` as a certain child flagged a template that lays out fine.
		const out = lint(
			"lib/card.tsx",
			`${OG_IMPORT}export const card = (options) =>
				new ImageResponse(
					<div>
						{options.logo ? <img src={options.logo} alt="" /> : <span style={{ display: "flex" }} />}
						{options.wordmark ? <div style={{ display: "flex" }}>{options.wordmark}</div> : null}
					</div>,
				);`,
		);
		expect(out).toEqual([]);
	});

	it("stays silent in files that are not satori-bound", () => {
		// The same JSX in an ordinary component is plain React and perfectly fine.
		const out = lint(
			"components/hero.tsx",
			`export const Hero = () => (
				<div>
					<span style={{ transition: "all 1s" }} />
					<span />
				</div>
			);`,
		);
		expect(out).toEqual([]);
	});

	it("lints an opengraph-image file even without a next/og import", () => {
		const out = lint(
			join("app", "opengraph-image.tsx"),
			`export default function Image() {
				return <div style={{ display: "flex", cursor: "pointer" }} />;
			}`,
		);
		expect(ruleIds(out)).toEqual([RULE]);
		expect(out[0].message).toContain("`cursor`");
	});

	it("leaves spread styles and unknown style expressions alone", () => {
		const out = lint(
			"lib/card.tsx",
			`${OG_IMPORT}export const card = (extra) =>
				new ImageResponse(
					<div style={extra}>
						<span style={{ display: "flex" }} />
						<span style={{ display: "flex" }} />
					</div>,
				);`,
		);
		expect(out).toEqual([]);
	});
});
