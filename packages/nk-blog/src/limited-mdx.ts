import matter from "gray-matter";
import type { Root } from "mdast";
import type { MdxJsxFlowElement, MdxJsxTextElement } from "mdast-util-mdx-jsx";
import { visit } from "unist-util-visit";
import type { VFile } from "vfile";
import { toErrorMessage } from "./http.js";

/**
 * The "limited MDX" trust boundary, enforced in the AST — not a convention.
 *
 * MDX is a programming language: `{process.env.X}`, `export const x = …`, and
 * ESM imports all execute server-side with zero components involved. A Tier-1
 * post (the only thing the automated publisher may emit as .mdx) is therefore
 * restricted to prose + whitelisted JSX elements with literal attributes;
 * every expression/ESM construct is rejected at compile time.
 */
export interface LimitedMdxOptions {
	/** Component names the post may reference (the site's vocabulary). */
	allow: readonly string[];
}

// Lowercase JSX that isn't one of these is almost certainly a miscased
// vocabulary reference (<callout>), which MDX would render as an inert,
// invisible HTML element — the one silent failure mode, so reject it.
const HTML_TAGS = new Set([
	"a",
	"abbr",
	"aside",
	"b",
	"blockquote",
	"br",
	"caption",
	"cite",
	"code",
	"dd",
	"del",
	"details",
	"div",
	"dl",
	"dt",
	"em",
	"figcaption",
	"figure",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"hr",
	"i",
	"img",
	"ins",
	"kbd",
	"li",
	"main",
	"mark",
	"nav",
	"ol",
	"p",
	"pre",
	"q",
	"s",
	"samp",
	"section",
	"small",
	"span",
	"strong",
	"sub",
	"summary",
	"sup",
	"table",
	"tbody",
	"td",
	"tfoot",
	"th",
	"thead",
	"tr",
	"u",
	"ul",
	"var",
	"video",
	"wbr",
]);

type JsxElement = MdxJsxFlowElement | MdxJsxTextElement;

// Attributes that carry a URL the browser will navigate/load — the XSS surface
// of otherwise-inert HTML (`<a href="javascript:…">`).
const URL_ATTRIBUTES = new Set([
	"href",
	"src",
	"poster",
	"cite",
	"action",
	"formaction",
	"data",
]);

/**
 * Accept relative paths/anchors and http(s)/mailto/tel absolute URLs; reject
 * every other scheme (`javascript:`, `data:`, `vbscript:`, …). Control chars
 * and whitespace are stripped before scheme detection because browsers strip
 * them when parsing, so `java\tscript:` would otherwise sneak through.
 */
function isSafeUrl(raw: string): boolean {
	// oxlint-disable-next-line no-control-regex -- stripping what browsers strip is the point
	const cleaned = raw.replace(/[\u0000-\u0020]/g, "");
	const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(cleaned);
	if (!scheme) return true;
	return /^(?:https?|mailto|tel)$/i.test(scheme[1] ?? "");
}

function checkElement(node: JsxElement, allow: readonly string[], file: VFile): void {
	const name = node.name;
	// Nameless = fragment (<>…</>), which is inert prose grouping.
	if (name === null) return;

	if (/^[a-z]/.test(name)) {
		if (!HTML_TAGS.has(name)) {
			file.fail(
				`Unknown HTML tag <${name}> — a miscased component? Vocabulary names are capitalized.`,
				node,
			);
		}
	} else if (!allow.includes(name)) {
		file.fail(
			`<${name}> is not in this blog's component vocabulary (${allow.join(", ")}).`,
			node,
		);
	}

	for (const attribute of node.attributes) {
		if (attribute.type !== "mdxJsxAttribute") {
			file.fail(
				`<${name}> uses a spread attribute; only literal props are allowed.`,
				node,
			);
			continue;
		}
		const value = attribute.value;
		// null/undefined = bare boolean prop; string = literal. Anything else is
		// an attribute-value expression — executable, so allow only simple
		// literals.
		if (value === null || value === undefined || typeof value === "string") {
			if (
				typeof value === "string" &&
				URL_ATTRIBUTES.has(attribute.name.toLowerCase()) &&
				!isSafeUrl(value)
			) {
				file.fail(
					`<${name} ${attribute.name}="…"> uses a URL scheme that is not allowed in limited MDX (http/https/mailto/tel or a relative path).`,
					node,
				);
			}
			continue;
		}
		const statement = value.data?.estree?.body[0];
		const expression =
			statement?.type === "ExpressionStatement"
				? statement.expression
				: undefined;
		if (expression?.type !== "Literal") {
			file.fail(
				`<${name} ${attribute.name}={…}> — attribute expressions are not allowed in limited MDX; use a literal.`,
				node,
			);
		}
	}
}

/** Remark plugin implementing the boundary. Throws (via `file.fail`) on violation. */
export function remarkLimitedMdx(options: LimitedMdxOptions) {
	return (tree: Root, file: VFile): void => {
		visit(tree, (node) => {
			switch (node.type) {
				case "mdxjsEsm":
					file.fail(
						"import/export statements are not allowed in limited MDX.",
						node,
					);
					break;
				case "mdxFlowExpression":
				case "mdxTextExpression":
					file.fail("{…} expressions are not allowed in limited MDX.", node);
					break;
				case "mdxJsxFlowElement":
				case "mdxJsxTextElement":
					checkElement(node, options.allow, file);
					break;
				// Plain markdown links/images compile to real anchors too — unlike
				// react-markdown (which sanitizes by default), the MDX pipeline
				// applies no urlTransform, so `[x](javascript:…)` must die here.
				case "link":
				case "image":
				case "definition":
					if (!isSafeUrl(node.url)) {
						file.fail(
							`Link/image URL "${node.url}" uses a scheme that is not allowed in limited MDX.`,
							node,
						);
					}
					break;
				default:
					break;
			}
		});
	};
}

export interface LimitedMdxViolation {
	message: string;
	line?: number;
	column?: number;
}

export interface LimitedMdxResult {
	ok: boolean;
	errors: LimitedMdxViolation[];
}

/**
 * Admin's pre-publish lint: compile (without evaluating) a post source —
 * frontmatter included — against a vocabulary. Also surfaces MDX syntax
 * errors, so an LLM-authored post can never break a target site's build.
 */
export async function validateLimitedMdx(
	source: string,
	options: LimitedMdxOptions,
): Promise<LimitedMdxResult> {
	const { compile } = await import("@mdx-js/mdx");
	const { default: remarkGfm } = await import("remark-gfm");
	const { content } = matter(source);
	try {
		await compile(content, {
			remarkPlugins: [remarkGfm, [remarkLimitedMdx, options]],
		});
		return { ok: true, errors: [] };
	} catch (error) {
		const place =
			error !== null &&
			typeof error === "object" &&
			"line" in error &&
			"column" in error
				? {
						line: typeof error.line === "number" ? error.line : undefined,
						column:
							typeof error.column === "number" ? error.column : undefined,
					}
				: {};
		return { ok: false, errors: [{ message: toErrorMessage(error), ...place }] };
	}
}
