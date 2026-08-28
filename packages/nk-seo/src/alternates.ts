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
	 *  - `"query"` (default): `${baseUrl}${path}?${param}=${locale}`
	 *  - `"prefix"`: `/${locale}${path}`
	 *
	 * The cluster's SHAPE is the same either way and is not configurable: every
	 * locale gets its own address, the default included, and the bare path
	 * belongs to no locale — it is the negotiating entry point that `x-default`
	 * names. `@ingram-tech/nk-i18n`'s `defineLocaleRouting` produces a valid
	 * config for this; prefer passing that over assembling one by hand.
	 */
	strategy?: "query" | "prefix";
	/** Query-param name for the `"query"` strategy. Default `"hl"`. */
	param?: string;
	/**
	 * The locale **the URL names**, which is not always the locale that rendered.
	 * It determines the self-referencing canonical, and a canonical is a claim
	 * about an address: `/pricing` canonicalizes to `/pricing` even while content
	 * negotiation renders it in French for a French visitor, because `/pricing`
	 * belongs to no locale. Passing the negotiated locale here instead makes the
	 * bare path claim to be the French URL, and the real French URL then looks
	 * like a duplicate of it.
	 *
	 * Leave it unset on the bare path. Under `"prefix"` it is detected from the
	 * pathname; under `"query"` the server cannot see the query string, so pass
	 * it — `hreflangConfigFor(routing)` from "@ingram-tech/nk-i18n/next" fills it
	 * in correctly.
	 */
	currentLocale?: string;
	/** Optional locale → hreflang tag map, e.g. `{ en: "en-BE", fr: "fr-BE" }`. */
	hrefLangTags?: Readonly<Partial<Record<string, string>>>;
}

export interface HreflangLink {
	/** The `hreflang` attribute value ("fr-BE", "x-default", …). */
	hrefLang: string;
	href: string;
}

export interface HreflangAlternates {
	/** Self-referencing canonical URL of `pathname`. */
	canonical: string;
	/** One link per locale, plus the trailing `x-default`. */
	links: HreflangLink[];
	/**
	 * The same links keyed by `hrefLang` (`x-default` included) — the shape Next
	 * wants for `Metadata.alternates.languages` / `createMetadata`'s
	 * `alternates`.
	 */
	languages: Record<string, string>;
}

/**
 * Computes the self-referencing canonical plus per-locale hreflang alternate
 * URLs (and an `x-default`) for `pathname`.
 */
export function hreflangAlternates(
	config: HreflangConfig,
	pathname: string,
): HreflangAlternates {
	const { strategy = "query", param = "hl", hrefLangTags } = config;

	// Accept both the bare and the locale-prefixed form of the path (middleware's
	// `x-pathname` carries the latter on a real localized route — blindly
	// prepending would emit /fr/fr/about) and detect the current locale from it.
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
		// Deliberately no fallback to a default locale: a bare path names none.
	}

	/** The bare (locale-free) URL — the negotiating entry point, `x-default`. */
	const bareUrl = absoluteUrl(basePath, config.baseUrl);

	/** Every locale has its own address, the default included. */
	const hrefFor = (locale: string): string => {
		if (strategy === "prefix") {
			return absoluteUrl(
				`/${locale}${basePath === "/" ? "" : basePath}`,
				config.baseUrl,
			);
		}
		return `${bareUrl}${bareUrl.includes("?") ? "&" : "?"}${param}=${locale}`;
	};

	// Self-referencing canonical: the current variant's own URL, or the bare path
	// when the URL names no locale. Canonicalizing a localized variant to the
	// bare path makes Google treat the variants as duplicates and ignore the
	// hreflang annotations entirely.
	const canonical =
		currentLocale && config.locales.includes(currentLocale)
			? hrefFor(currentLocale)
			: bareUrl;

	const links = [
		...config.locales.map((locale) => ({
			hrefLang: hrefLangTags?.[locale] ?? locale,
			href: hrefFor(locale),
		})),
		{ hrefLang: "x-default", href: bareUrl },
	];

	return {
		canonical,
		links,
		languages: Object.fromEntries(links.map((link) => [link.hrefLang, link.href])),
	};
}
