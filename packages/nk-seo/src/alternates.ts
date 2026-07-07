import { absoluteUrl } from "./url.js";

/**
 * Pure hreflang computation behind `<HreflangLinks>` (from
 * "@ingram-tech/nk-seo/components"). Usable directly wherever a component
 * doesn't fit (e.g. building `Metadata.alternates` in `generateMetadata`).
 */
export interface HreflangConfig {
	/** Absolute site origin, e.g. "https://acme.example". */
	baseUrl: string;
	/** Locales to emit alternates for, e.g. ["en", "fr", "nl"]. */
	locales: readonly string[];
	/**
	 * How locale is encoded in the alternate URLs:
	 *  - `"query"` (default): `${baseUrl}${path}?${param}=${locale}` for every locale.
	 *  - `"prefix"`: the default locale stays at the bare path; others get
	 *    `/${locale}${path}` (matches a localized-rewrite setup).
	 */
	strategy?: "query" | "prefix";
	/** Query-param name for the `"query"` strategy. Default `"hl"`. */
	param?: string;
	/** Default (unprefixed) locale for the `"prefix"` strategy. */
	defaultLocale?: string;
	/**
	 * Locale of the page being rendered. Determines the self-referencing
	 * canonical: a localized variant that canonicalizes to another URL makes
	 * Google discard the entire hreflang cluster. For the `"prefix"` strategy it
	 * is auto-detected from the pathname; for `"query"` the server can't see the
	 * query string, so pass it (e.g. from your locale negotiation).
	 */
	currentLocale?: string;
	/** Optional locale → hreflang tag map, e.g. `{ en: "en-BE", fr: "fr-BE" }`. */
	hrefLangTags?: Record<string, string>;
}

export interface HreflangLink {
	/** The `hreflang` attribute value ("fr-BE", "x-default", …). */
	hrefLang: string;
	href: string;
}

export interface HreflangAlternates {
	/** Self-referencing canonical URL of `pathname`. */
	canonical: string;
	/** One link per locale, plus the trailing `x-default` (→ canonical). */
	links: HreflangLink[];
}

/**
 * Computes the self-referencing canonical plus per-locale hreflang alternate
 * URLs (and an `x-default`) for `pathname`.
 */
export function hreflangAlternates(
	config: HreflangConfig,
	pathname: string,
): HreflangAlternates {
	const { strategy = "query", param = "hl", defaultLocale, hrefLangTags } = config;
	if (strategy === "prefix" && !defaultLocale) {
		// Without it every locale gets a prefix while canonical/x-default point
		// at a bare path that is no locale's URL — a silent SEO bug.
		throw new Error(
			"hreflangAlternates: `defaultLocale` is required for the prefix strategy.",
		);
	}

	// Prefix strategy: accept both the bare and the locale-prefixed form of the
	// path (middleware's `x-pathname` carries the latter on a real localized
	// route — blindly prepending would emit /fr/fr/about) and detect the
	// current locale from it.
	let basePath = pathname;
	let currentLocale = config.currentLocale;
	if (strategy === "prefix") {
		for (const locale of config.locales) {
			if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) {
				basePath = pathname.slice(locale.length + 1) || "/";
				currentLocale ??= locale;
				break;
			}
		}
		currentLocale ??= defaultLocale;
	}

	/** The default-locale URL — the bare path; also serves as x-default. */
	const defaultUrl = absoluteUrl(basePath, config.baseUrl);

	const hrefFor = (locale: string): string => {
		if (strategy === "prefix") {
			if (locale === defaultLocale) return defaultUrl;
			const clean = basePath === "/" ? "" : basePath;
			return absoluteUrl(`/${locale}${clean}`, config.baseUrl);
		}
		return `${defaultUrl}${defaultUrl.includes("?") ? "&" : "?"}${param}=${locale}`;
	};

	// Self-referencing canonical: the current variant's own URL. Canonicalizing
	// a localized variant to the bare path makes Google treat the variants as
	// duplicates and ignore the hreflang annotations entirely.
	const canonical =
		currentLocale &&
		currentLocale !== defaultLocale &&
		config.locales.includes(currentLocale)
			? hrefFor(currentLocale)
			: defaultUrl;

	return {
		canonical,
		links: [
			...config.locales.map((locale) => ({
				hrefLang: hrefLangTags?.[locale] ?? locale,
				href: hrefFor(locale),
			})),
			{ hrefLang: "x-default", href: defaultUrl },
		],
	};
}
