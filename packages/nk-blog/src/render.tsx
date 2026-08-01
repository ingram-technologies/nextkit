import { evaluate } from "@mdx-js/mdx";
import type { ComponentType, ReactElement } from "react";
import * as runtime from "react/jsx-runtime";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PluggableList } from "unified";
import type { BlogComponents } from "./contract.js";
import { remarkLimitedMdx } from "./limited-mdx.js";
import type { BlogPost } from "./types.js";

export { remarkLimitedMdx, validateLimitedMdx } from "./limited-mdx.js";
export type {
	LimitedMdxOptions,
	LimitedMdxResult,
	LimitedMdxViolation,
} from "./limited-mdx.js";

/**
 * The element map a site passes to style prose (h1–h4, p, code, tables, …).
 * One key set shared by both pipelines — react-markdown's `Components` is the
 * canonical shape. The map itself never ships from nk-blog: it is the brand.
 */
export type BlogElements = Components;

// Per-post (Tier-2) components, merged over the site vocabulary in MDX scope.
export type BespokeComponents = Record<string, ComponentType<never>>;

/** Renders a `.md` body. Pure data — the automated publisher's format. */
export const MarkdownBody: React.FC<{
	content: string;
	elements?: BlogElements;
}> = ({ content, elements }) => (
	<Markdown remarkPlugins={[remarkGfm]} components={elements}>
		{content}
	</Markdown>
);

/**
 * Renders an `.mdx` body (async server component). `limited` (default true)
 * enforces the vocabulary-only trust boundary; Tier-2 posts pass `bespoke`
 * components, which turns enforcement off — those are human-reviewed code.
 */
export async function MdxBody(props: {
	content: string;
	components: BlogComponents;
	elements?: BlogElements;
	bespoke?: BespokeComponents;
	limited?: boolean;
}): Promise<ReactElement> {
	// An *empty* bespoke map (a site conditionally spreading a possibly-empty
	// registry) must not silently switch off the trust boundary — only actual
	// human-reviewed components do.
	const limited = props.limited ?? Object.keys(props.bespoke ?? {}).length === 0;
	const scope = { ...props.components, ...props.bespoke };
	const remarkPlugins: PluggableList = limited
		? [remarkGfm, [remarkLimitedMdx, { allow: Object.keys(scope) }]]
		: [remarkGfm];
	const { default: MDXContent } = await evaluate(props.content, {
		...runtime,
		remarkPlugins,
	});
	return <MDXContent components={{ ...props.elements, ...scope }} />;
}

/** Format-dispatching renderer: the one component a post page needs. */
export async function PostBody(props: {
	post: BlogPost;
	components: BlogComponents;
	elements?: BlogElements;
	bespoke?: BespokeComponents;
}): Promise<ReactElement> {
	if (props.post.format === "md") {
		return <MarkdownBody content={props.post.content} elements={props.elements} />;
	}
	return MdxBody({
		content: props.post.content,
		components: props.components,
		elements: props.elements,
		bespoke: props.bespoke,
	});
}

/**
 * The hardened JSON-LD script tag, re-exported from nk-seo so it sits with the
 * node builders that feed it (`blogPostArticle`, `blogPostBreadcrumbs`).
 *
 * nk-blog hands sites schema *nodes* and left rendering to them, which meant
 * every site hand-rolled `<script type="application/ld+json"
 * dangerouslySetInnerHTML={{ __html: JSON.stringify(nodes) }} />` — and a post
 * title or FAQ answer containing `</script>` then closes the tag and injects
 * markup into the page. `JsonLd` escapes `<`, so the safe path is now the one
 * already in reach.
 */
export { JsonLd, serializeJsonLd } from "@ingram-tech/nk-seo/components";
