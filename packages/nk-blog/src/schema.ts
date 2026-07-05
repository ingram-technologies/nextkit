import { z } from "zod";

// YAML (via gray-matter) parses bare dates like `2026-04-30` into Date objects
// and quoted ones into strings — accept both, emit ISO 8601.
const isoDate = z.union([z.string(), z.date()]).transform((value, ctx) => {
	const parsed = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		ctx.addIssue({
			code: "custom",
			message: `Invalid date "${String(value)}". Use ISO format (YYYY-MM-DD).`,
		});
		return z.NEVER;
	}
	return parsed.toISOString();
});

const nonEmpty = z.string().trim().min(1);

/**
 * The shared frontmatter contract. Every post on every site validates against
 * this; unknown keys are preserved-ignored (sites may carry extras locally).
 *
 * Normalizations: `coverImage` is accepted as an alias of `image`; `author`
 * (string or list) and `authors` collapse into a single `authors: string[]`.
 */
export const blogFrontmatterSchema = z
	.object({
		title: nonEmpty,
		seoTitle: nonEmpty.optional(),
		description: nonEmpty,
		date: isoDate,
		updated: isoDate.optional(),
		author: z.union([nonEmpty, z.array(nonEmpty)]).optional(),
		authors: z.array(nonEmpty).optional(),
		category: nonEmpty.optional(),
		tags: z.array(nonEmpty).default([]),
		image: nonEmpty.optional(),
		coverImage: nonEmpty.optional(),
		slug: nonEmpty.optional(),
		draft: z.boolean().default(false),
		featured: z.boolean().default(false),
		// Reserved fields — validated now so adding behavior later isn't breaking.
		lang: nonEmpty.optional(),
		canonical: nonEmpty.optional(),
	})
	.transform(({ author, authors, coverImage, image, ...rest }) => ({
		...rest,
		image: image ?? coverImage,
		authors: authors ?? (Array.isArray(author) ? author : author ? [author] : []),
	}));

export type BlogFrontmatter = z.infer<typeof blogFrontmatterSchema>;
export type BlogFrontmatterInput = z.input<typeof blogFrontmatterSchema>;
