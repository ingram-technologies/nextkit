import type { Metadata } from "next";

/**
 * Per-site defaults for {@link createMetadata}. Set once, reuse on every page.
 */
export interface MetadataSiteConfig {
	/** Absolute site origin, e.g. "https://example.com". */
	baseUrl: string;
	/** OpenGraph `siteName`. */
	siteName: string;
	/** Site-relative or absolute default OG/Twitter image. */
	defaultImage?: string;
	defaultImageWidth?: number;
	defaultImageHeight?: number;
	/** OpenGraph locale, e.g. "en_US". */
	locale?: string;
	/** Twitter `@handle` for `site`. */
	twitterSite?: string;
	/** Twitter `@handle` for `creator`. */
	twitterCreator?: string;
}

/** Per-page inputs for the bound `pageMetadata` function. */
export interface PageMetadataInput {
	title: string;
	description: string;
	/** Site-relative path of the page, e.g. "/blog/post". Used for canonical + OG url. */
	path: string;
	/** Overrides the site default image (site-relative or absolute). */
	image?: string;
	type?: "website" | "article";
	keywords?: Metadata["keywords"];
	noIndex?: boolean;
	/** Merged into the generated `openGraph` (wins on conflict). */
	openGraph?: Partial<NonNullable<Metadata["openGraph"]>>;
	/** Merged into the generated `twitter` (wins on conflict). */
	twitter?: Partial<NonNullable<Metadata["twitter"]>>;
}

/**
 * Returns a `pageMetadata(input)` builder that produces a Next `Metadata`
 * object with a self-referencing canonical, OpenGraph, and Twitter card from
 * one title/description/path. Collapses the boilerplate every site repeats.
 *
 * @example
 * export const metadata = createMetadata({
 *   baseUrl: "https://example.com",
 *   siteName: "Acme",
 *   defaultImage: "/images/og.png",
 *   twitterSite: "@acme",
 * });
 * // in a page:
 * export const metadata = pageMetadata({ title, description, path: "/services" });
 */
export function createMetadata(site: MetadataSiteConfig) {
	const absolute = (path: string): string =>
		/^https?:\/\//.test(path) ? path : new URL(path, site.baseUrl).toString();

	return function pageMetadata(input: PageMetadataInput): Metadata {
		const imagePath = input.image ?? site.defaultImage;
		const imageUrl = imagePath ? absolute(imagePath) : undefined;
		const url = absolute(input.path);

		return {
			title: input.title,
			description: input.description,
			...(input.keywords ? { keywords: input.keywords } : {}),
			alternates: { canonical: url },
			...(input.noIndex ? { robots: { index: false, follow: false } } : {}),
			openGraph: {
				title: input.title,
				description: input.description,
				type: input.type ?? "website",
				url,
				siteName: site.siteName,
				...(site.locale ? { locale: site.locale } : {}),
				...(imageUrl
					? {
							images: [
								{
									url: imageUrl,
									width: site.defaultImageWidth ?? 1200,
									height: site.defaultImageHeight ?? 630,
									alt: input.title,
								},
							],
						}
					: {}),
				...input.openGraph,
			},
			twitter: {
				card: "summary_large_image",
				title: input.title,
				description: input.description,
				...(site.twitterSite ? { site: site.twitterSite } : {}),
				...(site.twitterCreator ? { creator: site.twitterCreator } : {}),
				...(imageUrl ? { images: [imageUrl] } : {}),
				...input.twitter,
			},
		};
	};
}

export type PageMetadata = ReturnType<typeof createMetadata>;
