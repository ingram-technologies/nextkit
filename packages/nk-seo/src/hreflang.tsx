import { headers } from "next/headers";

export interface HreflangLinksProps {
	/** Absolute site origin, e.g. "https://financica.app". */
	baseUrl: string;
	/** Locales to emit `<link rel="alternate" hreflang>` for, e.g. ["en", "fr", "nl"]. */
	locales: readonly string[];
	/**
	 * Path being rendered. Defaults to the `x-pathname` request header (set it in
	 * middleware: `headers.set("x-pathname", req.nextUrl.pathname)`). Pass
	 * explicitly if you don't use that header (e.g. from route params).
	 */
	pathname?: string;
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
	/** Emit a self-referencing `<link rel="canonical">`. Default `true`. */
	canonical?: boolean;
}

/**
 * Emits `<link rel="canonical">` plus per-locale `<link rel="alternate" hreflang>`
 * (and an `x-default`) for the current path. Render inside `<head>` (e.g. from
 * the root layout). Server component — reads the `x-pathname` header by default.
 */
export async function HreflangLinks({
	baseUrl,
	locales,
	pathname,
	strategy = "query",
	param = "hl",
	defaultLocale,
	hrefLangTags,
	canonical = true,
}: HreflangLinksProps) {
	const path = pathname ?? (await headers()).get("x-pathname") ?? "/";
	const canonicalUrl = `${baseUrl}${path}`;

	const hrefFor = (locale: string): string => {
		if (strategy === "prefix") {
			if (defaultLocale && locale === defaultLocale) {
				return canonicalUrl;
			}
			const clean = path === "/" ? "" : path;
			return `${baseUrl}/${locale}${clean}`;
		}
		return `${canonicalUrl}?${param}=${locale}`;
	};

	return (
		<>
			{canonical ? <link rel="canonical" href={canonicalUrl} /> : null}
			{locales.map((locale) => (
				<link
					key={locale}
					rel="alternate"
					hrefLang={hrefLangTags?.[locale] ?? locale}
					href={hrefFor(locale)}
				/>
			))}
			<link rel="alternate" hrefLang="x-default" href={canonicalUrl} />
		</>
	);
}
