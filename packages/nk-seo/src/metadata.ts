import type { Metadata } from "next";
import { absoluteUrl } from "./url.js";

/**
 * Per-site defaults for {@link createMetadata}. Set once, reuse on every page.
 */
export interface MetadataSiteConfig {
	/** Absolute site origin, e.g. "https://ingram.tech". */
	baseUrl: string;
	/** OpenGraph `siteName`. */
	siteName: string;
	/**
	 * `title.template` emitted by `pageMetadata.root()`, e.g. "%s | Acme".
	 * Applies to every child page whose title is a plain string.
	 */
	titleTemplate?: string;
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

/** Inputs for `pageMetadata.root()` — the root-layout metadata. */
export interface RootMetadataInput {
	/** `title.default` for pages without their own. Defaults to `siteName`. */
	title?: string;
	description?: string;
	/** Extra `Metadata` merged over the generated object (wins on conflict). */
	overrides?: Metadata;
}

/**
 * Returns a `pageMetadata(input)` builder that produces a Next `Metadata`
 * object with a self-referencing canonical, OpenGraph, and Twitter card from
 * one title/description/path. Collapses the boilerplate every site repeats.
 *
 * `pageMetadata.root(input?)` builds the root-layout metadata: `metadataBase`,
 * the default title (plus `titleTemplate` when configured), and description —
 * pages then only set their own title/description/path.
 *
 * @example
 * export const pageMetadata = createMetadata({
 *   baseUrl: "https://ingram.tech",
 *   siteName: "Ingram Technologies",
 *   titleTemplate: "%s | Ingram Technologies",
 *   defaultImage: "/images/og.png",
 *   twitterSite: "@IngramTech",
 * });
 * // app/layout.tsx:
 * export const metadata = pageMetadata.root({ description: "AI deployment." });
 * // in a page:
 * export const metadata = pageMetadata({ title, description, path: "/services" });
 */
export function createMetadata(site: MetadataSiteConfig) {
	const absolute = (path: string): string => absoluteUrl(path, site.baseUrl);

	function pageMetadata(input: PageMetadataInput): Metadata {
		const imagePath = input.image ?? site.defaultImage;
		const imageUrl = imagePath ? absolute(imagePath) : undefined;
		const url = absolute(input.path);

		return {
			metadataBase: new URL(site.baseUrl),
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
	}

	pageMetadata.root = function rootMetadata(input: RootMetadataInput = {}): Metadata {
		const title = input.title ?? site.siteName;
		return {
			metadataBase: new URL(site.baseUrl),
			title: site.titleTemplate
				? { default: title, template: site.titleTemplate }
				: title,
			...(input.description ? { description: input.description } : {}),
			...input.overrides,
		};
	};

	return pageMetadata;
}

export type PageMetadata = ReturnType<typeof createMetadata>;
