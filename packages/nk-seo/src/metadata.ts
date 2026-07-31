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
	/**
	 * Default OpenGraph locale, e.g. "en_US". On a multilingual site set the
	 * per-page `locale` instead (or as well, as the fallback).
	 */
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
	/**
	 * OpenGraph locale for this page, e.g. "fr_BE". Overrides `site.locale` —
	 * on a multilingual site `og:locale` has to vary per page.
	 */
	locale?: string;
	/**
	 * Merged into the generated `alternates` (wins on conflict). The reason it
	 * exists: `alternates.languages` is per-page on a localized site, and
	 * spreading the result to bolt it on drops the rest of the object.
	 * `hreflangAlternates()` returns a ready-made `languages` map.
	 */
	alternates?: Partial<NonNullable<Metadata["alternates"]>>;
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
		const locale = input.locale ?? site.locale;

		return {
			metadataBase: new URL(site.baseUrl),
			title: input.title,
			description: input.description,
			...(input.keywords ? { keywords: input.keywords } : {}),
			alternates: { canonical: url, ...input.alternates },
			// noindex but follow: keep link equity flowing through the page. Use a
			// full robots override in the page's own metadata for nofollow too.
			...(input.noIndex ? { robots: { index: false, follow: true } } : {}),
			openGraph: {
				title: input.title,
				description: input.description,
				type: input.type ?? "website",
				url,
				siteName: site.siteName,
				...(locale ? { locale } : {}),
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

/** Inputs for {@link ogImageMetadata}. */
export interface OgImageMetadataInput {
	/** Absolute site origin, e.g. "https://acme.example". */
	baseUrl: string;
	/**
	 * Path of the image route — the route the `opengraph-image.tsx` file
	 * convention serves, e.g. "/opengraph-image" or "/en/opengraph-image" when
	 * the file sits under `app/[locale]/`.
	 */
	path: string;
	alt: string;
	/** Defaults to the 1200×630 the `/og` template renders. */
	width?: number;
	height?: number;
}

/**
 * Builds the `openGraph.images` entry for a card served by Next's
 * `opengraph-image` file convention.
 *
 * Next attaches a file-convention image only to the segment that declares it,
 * and a page's own `openGraph` object *replaces* the inherited one rather than
 * merging into it — so any page returning `openGraph` from `generateMetadata`
 * silently loses the card. Build the list once and spread it into every page.
 *
 * `createMetadata`'s `defaultImage` / per-page `image` already do this; reach
 * for the standalone helper when you assemble `Metadata` by hand.
 *
 * @example
 * const images = ogImageMetadata({
 *   baseUrl, path: `/${locale}/opengraph-image`, alt: "Acme",
 * });
 * return { title, openGraph: { title, url, images } };
 */
export function ogImageMetadata(input: OgImageMetadataInput) {
	return [
		{
			url: absoluteUrl(input.path, input.baseUrl),
			width: input.width ?? 1200,
			height: input.height ?? 630,
			alt: input.alt,
		},
	];
}
