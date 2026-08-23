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
	 *    `/${locale}${path}` (matches a localized-rewrite setup). Set
	 *    {@link HreflangConfig.prefixDefaultLocale} for sites that prefix every
	 *    locale instead.
	 */
	strategy?: "query" | "prefix";
	/** Query-param name for the `"query"` strategy. Default `"hl"`. */
	param?: string;
	/** Default locale. Required for `"prefix"`; it is what `x-default` resolves to. */
	defaultLocale?: string;
	/**
	 * `"prefix"` only: prefix the default locale too (`/en/about`, never
	 * `/about`), and point `x-default` at that prefixed URL. For sites whose
	 * locale negotiation redirects every bare path — emitting the bare path as
	 * an alternate would annotate a URL that 3xx-redirects, which is the bug the
	 * mandatory `defaultLocale` exists to prevent.
	 */
	prefixDefaultLocale?: boolean;
	/**
	 * The locale **the URL names**, which is not always the locale that rendered.
	 * It determines the self-referencing canonical, and a canonical is a claim
	 * about an address: under `"query"`, `/pricing` canonicalizes to `/pricing`
	 * even while content negotiation renders it in French for a French visitor,
	 * because `/pricing` is the negotiating entry point and belongs to no locale.
	 * Passing the negotiated locale here instead makes the bare path claim to be
	 * the French URL, and the real French URL then looks like a duplicate.
	 *
	 * Leave it unset on a negotiating bare path. Under `"prefix"` it is detected
	 * from the pathname; under `"query"` the server cannot see the query string,
	 * so pass it — `hreflangConfigFor(routing)` from
	 * "@ingram-tech/nk-i18n/next" fills it in correctly.
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
	const {
		strategy = "query",
		param = "hl",
		defaultLocale,
		prefixDefaultLocale,
		hrefLangTags,
	} = config;
	if (strategy === "prefix" && !defaultLocale) {
		// Without it canonical/x-default point at a bare path that is no
		// locale's URL — a silent SEO bug. (With `prefixDefaultLocale` no bare
		// path is emitted at all, but x-default still has to resolve to *some*
		// locale, so the requirement stands.)
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

	/** The bare (locale-free) URL of the path. */
	const bareUrl = absoluteUrl(basePath, config.baseUrl);

	const prefixedUrl = (locale: string): string =>
		absoluteUrl(`/${locale}${basePath === "/" ? "" : basePath}`, config.baseUrl);

	const hrefFor = (locale: string): string => {
		if (strategy === "prefix") {
			if (locale === defaultLocale && !prefixDefaultLocale) return bareUrl;
			return prefixedUrl(locale);
		}
		return `${bareUrl}${bareUrl.includes("?") ? "&" : "?"}${param}=${locale}`;
	};

	/** x-default: the default locale's own URL, prefixed or not. */
	const defaultUrl =
		strategy === "prefix" && prefixDefaultLocale && defaultLocale
			? prefixedUrl(defaultLocale)
			: bareUrl;

	// Self-referencing canonical: the current variant's own URL. Canonicalizing
	// a localized variant to the bare path makes Google treat the variants as
	// duplicates and ignore the hreflang annotations entirely.
	//
	// Whether the default locale has a URL of its own is strategy-dependent, and
	// conflating the two is a silent way to delete the default locale from the
	// cluster. Under `"prefix"` it shares the bare path (unless every locale is
	// prefixed), so its canonical IS the bare path. Under `"query"` every locale
	// gets its own `?param=` address and the bare path belongs to none of them:
	// it is the negotiating entry point that `x-default` names. So `?hl=en` must
	// canonicalize to `?hl=en`, never to the bare path.
	const defaultLocaleOwnsBarePath = strategy === "prefix" && !prefixDefaultLocale;
	const canonical =
		currentLocale &&
		config.locales.includes(currentLocale) &&
		!(defaultLocaleOwnsBarePath && currentLocale === defaultLocale)
			? hrefFor(currentLocale)
			: defaultUrl;

	const links = [
		...config.locales.map((locale) => ({
			hrefLang: hrefLangTags?.[locale] ?? locale,
			href: hrefFor(locale),
		})),
		{ hrefLang: "x-default", href: defaultUrl },
	];

	return {
		canonical,
		links,
		languages: Object.fromEntries(links.map((link) => [link.hrefLang, link.href])),
	};
}
