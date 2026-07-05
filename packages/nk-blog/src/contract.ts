import type { ComponentType, ReactNode } from "react";
import { z } from "zod";

/**
 * The vocabulary manifest — the cross-site component contract.
 *
 * A Tier-1 post may reference exactly these components by bare name. The
 * package owns the names and prop schemas; each site owns the pixels (see
 * `@ingram-tech/nk-blog/unstyled` for the behavior-correct defaults). The
 * admin publisher validates a post against this manifest (at the version the
 * target site pins) before committing it.
 */
export const VOCABULARY = [
	"Callout",
	"Figure",
	"YouTube",
	"Tweet",
	"NewsletterSubscribe",
] as const;

export type VocabularyName = (typeof VOCABULARY)[number];

// MDX literal attributes arrive as strings (`width="1200"`), so dimension-ish
// props coerce rather than demand numbers.
const dimension = z.union([z.number(), z.string().regex(/^\d+$/)]);

export const calloutProps = z.object({
	variant: z.enum(["note", "tip", "warning", "important"]).default("note"),
	title: z.string().optional(),
});

export const figureProps = z.object({
	src: z.string().min(1),
	alt: z.string(),
	caption: z.string().optional(),
	width: dimension.optional(),
	height: dimension.optional(),
});

export const youTubeProps = z.object({
	id: z.string().min(1),
	title: z.string().optional(),
	start: dimension.optional(),
});

export const tweetProps = z.object({
	id: z.string().min(1),
});

export const newsletterSubscribeProps = z.object({
	action: z.string().min(1),
	placeholder: z.string().optional(),
	buttonLabel: z.string().optional(),
});

/** Machine-checkable side of the contract, keyed by component name. */
export const vocabularyProps = {
	Callout: calloutProps,
	Figure: figureProps,
	YouTube: youTubeProps,
	Tweet: tweetProps,
	NewsletterSubscribe: newsletterSubscribeProps,
} satisfies Record<VocabularyName, z.ZodType>;

// React-facing prop types: the schema's input shape plus children/className,
// which Zod does not model.
type WithReactExtras<T> = T & { children?: ReactNode; className?: string };

export type CalloutProps = WithReactExtras<z.input<typeof calloutProps>>;
export type FigureProps = WithReactExtras<z.input<typeof figureProps>>;
export type YouTubeProps = WithReactExtras<z.input<typeof youTubeProps>>;
export type TweetProps = WithReactExtras<z.input<typeof tweetProps>>;
export type NewsletterSubscribeProps = WithReactExtras<
	z.input<typeof newsletterSubscribeProps>
>;

export interface VocabularyPropsMap {
	Callout: CalloutProps;
	Figure: FigureProps;
	YouTube: YouTubeProps;
	Tweet: TweetProps;
	NewsletterSubscribe: NewsletterSubscribeProps;
}

/**
 * The exhaustive registry a site must provide. Exhaustiveness is the point:
 * a site missing a vocabulary component fails `tsc`, so an admin-published
 * post can never reference something a site cannot render.
 */
export type BlogComponents = {
	[K in VocabularyName]: ComponentType<VocabularyPropsMap[K]>;
};

/** Identity helper — exists purely for inference and error locality. */
export function defineBlogComponents(components: BlogComponents): BlogComponents {
	return components;
}
