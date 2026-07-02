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
	const canonical = absoluteUrl(pathname, config.baseUrl);

	const hrefFor = (locale: string): string => {
		if (strategy === "prefix") {
			if (defaultLocale && locale === defaultLocale) {
				return canonical;
			}
			const clean = pathname === "/" ? "" : pathname;
			return absoluteUrl(`/${locale}${clean}`, config.baseUrl);
		}
		return `${canonical}?${param}=${locale}`;
	};

	return {
		canonical,
		links: [
			...config.locales.map((locale) => ({
				hrefLang: hrefLangTags?.[locale] ?? locale,
				href: hrefFor(locale),
			})),
			{ hrefLang: "x-default", href: canonical },
		],
	};
}
