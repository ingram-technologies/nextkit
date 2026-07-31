import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const pluginPath = join(
	dirname(fileURLToPath(import.meta.url)),
	"../lib/oxlint-plugins/index.js",
);

const dirs = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

/** Lints `source` at `relativePath` — the rule keys off both path and imports. */
const lint = (relativePath, source) => {
	const dir = mkdtempSync(join(tmpdir(), "nk-oxlint-satori-"));
	dirs.push(dir);
	writeFileSync(
		join(dir, ".oxlintrc.json"),
		JSON.stringify({
			jsPlugins: [pluginPath],
			rules: { "nextkit/satori-css": "error" },
		}),
	);
	mkdirSync(join(dir, dirname(relativePath)), { recursive: true });
	writeFileSync(join(dir, relativePath), source);
	try {
		execFileSync("oxlint", ["-c", ".oxlintrc.json", relativePath], {
			cwd: dir,
			encoding: "utf8",
		});
		return "";
	} catch (error) {
		return String(error.stdout ?? "");
	}
};

const OG_IMPORT = `import { ImageResponse } from "next/og";\n`;

describe("satori-css", () => {
	it("flags style properties satori silently drops", () => {
		const out = lint(
			"lib/card.tsx",
			`${OG_IMPORT}export const card = () =>
				new ImageResponse(<div style={{ display: "flex", transition: "all 1s", backdropFilter: "blur(4px)" }} />);`,
		);
		expect(out).toContain("satori does not implement `transition`");
		expect(out).toContain("satori does not implement `backdropFilter`");
	});

	it("accepts the properties satori does implement, including kebab-case keys and CSS variables", () => {
		const out = lint(
			"lib/card.tsx",
			`${OG_IMPORT}export const card = () =>
				new ImageResponse(
					<div style={{ display: "flex", padding: 48, "--accent": "#fff", boxShadow: "0 0 1px #000", WebkitTextStrokeColor: "#000", "background-clip": "text" }} />,
				);`,
		);
		expect(out).toBe("");
	});

	it("flags calc(), which satori drops", () => {
		const out = lint(
			"lib/card.tsx",
			`${OG_IMPORT}export const card = () =>
				new ImageResponse(<div style={{ display: "flex", width: "calc(100% - 20px)" }} />);`,
		);
		expect(out).toContain("does not support `calc()`");
	});

	it("flags a multi-child element that never declares display", () => {
		const out = lint(
			"lib/card.tsx",
			`${OG_IMPORT}export const card = () =>
				new ImageResponse(
					<div>
						<span style={{ display: "flex" }} />
						<span style={{ display: "flex" }} />
					</div>,
				);`,
		);
		expect(out).toContain("2 children but no `display`");
	});

	it("accepts a single-child element with no display", () => {
		const out = lint(
			"lib/card.tsx",
			`${OG_IMPORT}export const card = () =>
				new ImageResponse(<div><span style={{ display: "flex" }} /></div>);`,
		);
		expect(out).toBe("");
	});

	it("flags text mixed with element siblings", () => {
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
		expect(out).toContain("text node next to element siblings");
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
		expect(out).toBe("");
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
		expect(out).toBe("");
	});

	it("lints an opengraph-image file even without a next/og import", () => {
		const out = lint(
			join("app", "opengraph-image.tsx"),
			`export default function Image() {
				return <div style={{ display: "flex", cursor: "pointer" }} />;
			}`,
		);
		expect(out).toContain("satori does not implement `cursor`");
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
		expect(out).toBe("");
	});
});
