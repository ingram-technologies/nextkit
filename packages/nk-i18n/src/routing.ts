import { negotiateAcceptLanguage } from "./negotiate.js";

/**
 * Locale routing: the single definition of how a locale is encoded in a URL,
 * and the fixed precedence by which a request's locale is decided.
 *
 * This exists because the two halves of a multilingual site are easy to drift
 * apart. One half advertises URLs to search engines (`@ingram-tech/nk-seo`'s
 * hreflang alternates); the other half decides which language a request gets.
 * When they disagree — the classic failure is middleware that redirects away
 * the very `?hl=` URLs hreflang points at — the site tells Google the French
 * page lives at an address that does not serve French, and Google discards the
 * whole cluster. Nothing catches that, because neither half can see the other.
 *
 * A {@link LocaleRouting} is deliberately shaped so it can be handed straight
 * to `hreflangAlternates` as its config: one object owns the locale list, the
 * default, the strategy, the param name and the hreflang tags, so the
 * advertised URL and the served URL are the same string by construction.
 */

/**
 * How a locale is encoded in a URL. This is the ONLY thing that varies between
 * sites; the cluster's shape does not (see {@link LocaleRouting}).
 *
 * - `"query"`: `?<param>=<locale>`. No routing work, and the option Google
 *   supports but does not recommend — parameters can be folded as duplicates
 *   and there has been no URL Parameters tool to override that since 2022.
 * - `"prefix"`: `/<locale>/…`. Better on every SEO axis (a path cannot be
 *   folded into another document, survives link-sharing that strips query
 *   strings, and puts the target-language keyword in the URL), at the cost of
 *   a route segment or a middleware rewrite.
 *
 * Prefer `"prefix"` for a new site. Use `"query"` when restructuring routes is
 * not worth it, knowing it is the weaker of the two.
 */
export type LocaleStrategy = "query" | "prefix";

export interface LocaleRoutingConfig<L extends string = string> {
	/** Absolute site origin, e.g. "https://acme.example". */
	baseUrl: string;
	/** Every supported locale, e.g. `["en", "fr", "nl"]`. */
	locales: readonly L[];
	/** The locale served when no signal says otherwise. */
	defaultLocale: L;
	/** Default `"query"`. See {@link LocaleStrategy}; prefer `"prefix"`. */
	strategy?: LocaleStrategy;
	/** Query-param name for the `"query"` strategy. Default `"hl"`. */
	param?: string;
	/** Remembered-choice cookie. Default `"locale"`. */
	cookieName?: string;
	/**
	 * ISO-3166 alpha-2 country → locale, for the last-resort country signal.
	 * Omit a country whose language is genuinely ambiguous (Belgium is the
	 * obvious one: geography tells you nothing about whether a visitor reads
	 * French or Dutch) so it falls through instead of guessing. Countries
	 * absent from the map are ignored.
	 */
	countryLocales?: Readonly<Record<string, L>>;
	/**
	 * Optional locale → hreflang tag, e.g. `{ en: "en-BE", fr: "fr-BE" }`. Lives
	 * here rather than on the SEO config so a site with regional tags does not
	 * have to build a second object — that second object is exactly the drift
	 * this package exists to prevent. Also the value to put in `<html lang>`,
	 * via {@link LocaleRouting.htmlLang}.
	 *
	 * Only use region tags when the content genuinely differs by country. They
	 * fragment the cluster and cut you out of neighbouring markets otherwise.
	 */
	hrefLangTags?: Readonly<Partial<Record<L, string>>>;
}

/**
 * The signals a locale can be decided from, in no particular order — the order
 * is {@link LOCALE_PRECEDENCE}'s to own, not the caller's.
 */
export interface LocaleSignals {
	/** The locale the URL itself names (the `?hl=` value, or a path prefix). */
	url?: string | null | undefined;
	/** The signed-in user's stored preference. */
	account?: string | null | undefined;
	/** The remembered-choice cookie. */
	cookie?: string | null | undefined;
	/** Raw `Accept-Language` header value; negotiated, not matched literally. */
	acceptLanguage?: string | null | undefined;
	/** ISO-3166 alpha-2 country code, mapped through `countryLocales`. */
	country?: string | null | undefined;
}

/**
 * The routing definition. Hand it to BOTH your locale resolver and your
 * hreflang config — a `LocaleRouting` is a valid `HreflangConfig`, so the URL
 * you advertise and the URL you serve cannot drift.
 *
 * **The cluster shape is fixed and not configurable**, whichever strategy you
 * pick:
 *
 * - every locale has its own address (`?hl=en` / `/en/…`), the default
 *   included;
 * - the bare path belongs to NO locale. It negotiates, and it is `x-default`.
 *
 * The two shapes this deliberately does not offer are the ones that go wrong.
 * A bare path that IS the default locale serves English to a French visitor who
 * followed a bare internal link — and every site that starts with a cookie
 * switcher has bare internal links. A bare path that redirects on perceived
 * language is what Google tells you not to build, and makes `x-default` point
 * at a URL that is not language-neutral. Offering either as an option is how
 * the fleet drifts, so neither is offered.
 */
export interface LocaleRouting<L extends string = string> {
	baseUrl: string;
	locales: readonly L[];
	defaultLocale: L;
	strategy: LocaleStrategy;
	param: string;
	cookieName: string;
	countryLocales: Readonly<Record<string, L>>;
	hrefLangTags?: Readonly<Partial<Record<string, string>>>;
	/** Type guard, so sites don't each write their own. */
	isLocale: (value: unknown) => value is L;
	/**
	 * The locale this URL *names*, or `undefined` for the bare path, which names
	 * none. This is the value canonical tags must follow: a canonical is a
	 * statement about an address, not about whichever language negotiation
	 * happened to render.
	 */
	localeFromUrl: (url: URL | string) => L | undefined;
	/** The absolute address that always serves `locale`. */
	urlForLocale: (pathname: string, locale: L) => string;
	/** The absolute bare address — the negotiating entry point, `x-default`. */
	bareUrl: (pathname: string) => string;
	/**
	 * The app-facing pathname with any locale prefix removed, for the middleware
	 * rewrite. Identity under `"query"`.
	 */
	stripLocale: (pathname: string) => string;
	/** The `<html lang>` value: the regional tag if one is set, else the locale. */
	htmlLang: (locale: L) => string;
	/** Apply the fixed precedence to a set of signals. */
	resolve: (signals: LocaleSignals) => L;
}

/** Resolve `path` against `baseUrl`, refusing anything that escapes the origin. */
const absolute = (path: string, baseUrl: string): string => {
	const base = new URL(baseUrl);
	const resolved = new URL(path, base);
	if (resolved.origin !== base.origin) {
		throw new Error(
			`@ingram-tech/nk-i18n: "${path}" resolves outside the site origin ${base.origin}`,
		);
	}
	return resolved.toString();
};

/**
 * The one order every Ingram site decides a locale in:
 *
 *   1. the URL (`?hl=fr`, `/fr/…`) — an address that names a language always
 *      wins, including over a signed-in user's stored preference. A shared link
 *      must show the recipient the language it names, or the link is a lie and
 *      the hreflang annotation pointing at it is too.
 *   2. the account's stored preference
 *   3. the remembered-choice cookie
 *   4. `Accept-Language`
 *   5. country, via `countryLocales`
 *
 * ...then `defaultLocale`. The order is not configurable, and it is declared
 * exactly once so the eager and lazy resolvers cannot disagree. It is the whole
 * reason this lives in nextkit: a site that puts the cookie above the URL
 * silently breaks every localized link it ships, and the breakage is invisible
 * until the search traffic is gone.
 */
export const LOCALE_PRECEDENCE = [
	"url",
	"account",
	"cookie",
	"acceptLanguage",
	"country",
] as const;

export type LocaleSignal = (typeof LOCALE_PRECEDENCE)[number];

type RoutingSlice<L extends string> = Pick<
	LocaleRouting<L>,
	"locales" | "defaultLocale" | "countryLocales" | "isLocale"
>;

/**
 * Turn one raw signal value into a locale. Most signals are already a locale
 * code and only need narrowing; `acceptLanguage` is a header to negotiate and
 * `country` is an ISO code to look up.
 */
const normalize = <L extends string>(
	signal: LocaleSignal,
	raw: string | null | undefined,
	routing: RoutingSlice<L>,
): L | undefined => {
	if (raw === null || raw === undefined || raw === "") return undefined;
	if (signal === "acceptLanguage") {
		const negotiated = negotiateAcceptLanguage(raw, routing.locales);
		return routing.isLocale(negotiated) ? negotiated : undefined;
	}
	if (signal === "country") {
		const mapped = routing.countryLocales[raw.toUpperCase()];
		return routing.isLocale(mapped) ? mapped : undefined;
	}
	return routing.isLocale(raw) ? raw : undefined;
};

/** Apply {@link LOCALE_PRECEDENCE} to already-gathered signal values. */
export function resolveLocaleFromSignals<L extends string>(
	routing: RoutingSlice<L>,
	signals: LocaleSignals,
): L {
	for (const signal of LOCALE_PRECEDENCE) {
		const locale = normalize(signal, signals[signal], routing);
		if (locale) return locale;
	}
	return routing.defaultLocale;
}

/** A signal source; may be async, and is only called if the chain reaches it. */
export type LocaleSupplier = () =>
	| string
	| null
	| undefined
	| Promise<string | null | undefined>;

export type LocaleSuppliers = Partial<Record<LocaleSignal, LocaleSupplier>>;

/**
 * Apply {@link LOCALE_PRECEDENCE} to lazily-evaluated sources, stopping at the
 * first that yields a locale. Suppliers later in the chain are never called, so
 * a URL that names its language costs no database round trip.
 */
export async function resolveLocaleFromSuppliers<L extends string>(
	routing: RoutingSlice<L>,
	suppliers: LocaleSuppliers,
): Promise<L> {
	for (const signal of LOCALE_PRECEDENCE) {
		const supplier = suppliers[signal];
		if (!supplier) continue;
		const locale = normalize(signal, await supplier(), routing);
		if (locale) return locale;
	}
	return routing.defaultLocale;
}

/** Build the routing definition. See {@link LocaleRouting}. */
export function defineLocaleRouting<const L extends string>(
	config: LocaleRoutingConfig<L>,
): LocaleRouting<L> {
	const {
		baseUrl,
		locales,
		defaultLocale,
		strategy = "query",
		param = "hl",
		cookieName = "locale",
		countryLocales = {} as Readonly<Record<string, L>>,
		hrefLangTags,
	} = config;

	if (!locales.includes(defaultLocale)) {
		throw new Error(
			`@ingram-tech/nk-i18n: defaultLocale "${defaultLocale}" is not in locales [${locales.join(", ")}].`,
		);
	}

	const isLocale = (value: unknown): value is L =>
		typeof value === "string" && (locales as readonly string[]).includes(value);

	const bareUrl = (pathname: string): string => absolute(pathname, baseUrl);

	/** The locale segment at the head of `pathname`, if any. */
	const prefixOf = (pathname: string): L | undefined =>
		locales.find(
			(locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
		);

	const stripLocale = (pathname: string): string => {
		if (strategy !== "prefix") return pathname;
		const locale = prefixOf(pathname);
		return locale ? pathname.slice(locale.length + 1) || "/" : pathname;
	};

	const urlForLocale = (pathname: string, locale: L): string => {
		const base = stripLocale(pathname);
		// Every locale gets its own address, the default included: the bare path
		// is the negotiating entry point and belongs to none of them.
		if (strategy === "prefix") {
			return absolute(`/${locale}${base === "/" ? "" : base}`, baseUrl);
		}
		const bare = bareUrl(base);
		return `${bare}${bare.includes("?") ? "&" : "?"}${param}=${locale}`;
	};

	const localeFromUrl = (url: URL | string): L | undefined => {
		const parsed = typeof url === "string" ? new URL(url, baseUrl) : url;
		if (strategy === "prefix") return prefixOf(parsed.pathname);
		const value = parsed.searchParams.get(param);
		return isLocale(value) ? value : undefined;
	};

	const routing: LocaleRouting<L> = {
		baseUrl,
		locales,
		defaultLocale,
		strategy,
		param,
		cookieName,
		countryLocales,
		hrefLangTags,
		isLocale,
		localeFromUrl,
		urlForLocale,
		bareUrl,
		stripLocale,
		htmlLang: (locale) => hrefLangTags?.[locale] ?? locale,
		resolve: (signals) => resolveLocaleFromSignals(routing, signals),
	};
	return routing;
}
