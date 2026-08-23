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
 * default, the strategy and the param name, so the advertised URL and the
 * served URL are the same string by construction.
 */

/**
 * How a locale is encoded in a URL.
 *
 * - `"query"`: every locale gets `?<param>=<locale>`, and the bare path is a
 *   negotiating entry point that belongs to no locale (it is `x-default`).
 * - `"prefix"`: the default locale lives at the bare path and the rest get
 *   `/<locale>/…`, unless {@link LocaleRoutingConfig.prefixDefaultLocale}.
 */
export type LocaleStrategy = "query" | "prefix";

export interface LocaleRoutingConfig {
	/** Absolute site origin, e.g. "https://acme.example". */
	baseUrl: string;
	/** Every supported locale, e.g. `["en", "fr", "nl"]`. */
	locales: readonly string[];
	/**
	 * The locale served when no signal says otherwise. Under `"query"` it is
	 * NOT the owner of the bare path: the bare path negotiates and `x-default`
	 * points at it, while the default locale gets its own `?<param>=` address
	 * like every other locale.
	 */
	defaultLocale: string;
	/** Default `"query"`. */
	strategy?: LocaleStrategy;
	/** Query-param name for the `"query"` strategy. Default `"hl"`. */
	param?: string;
	/** `"prefix"` only: prefix the default locale too (`/en/about`). */
	prefixDefaultLocale?: boolean;
	/**
	 * ISO-3166 alpha-2 country → locale, for the last-resort country signal.
	 * Omit a country whose language is genuinely ambiguous (Belgium is the
	 * obvious one: geography tells you nothing about whether a visitor reads
	 * French or Dutch) so it falls through to {@link defaultLocale} instead of
	 * guessing. Countries absent from the map are ignored.
	 */
	countryLocales?: Readonly<Record<string, string>>;
}

/**
 * The signals a locale can be decided from, in no particular order — the order
 * is {@link resolveLocaleFromSignals}'s to own, not the caller's.
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

export interface LocaleRouting extends Required<
	Omit<LocaleRoutingConfig, "countryLocales">
> {
	countryLocales: Readonly<Record<string, string>>;
	/** Narrow an arbitrary value (cookie, header, DB column) to a locale. */
	isLocale: (value: unknown) => boolean;
	/**
	 * The locale this URL *names*, or `undefined` when it names none (the bare
	 * negotiating path under `"query"`). This is the value canonical tags must
	 * follow: a canonical is a statement about an address, not about whichever
	 * language negotiation happened to render.
	 */
	localeFromUrl: (url: URL | string) => string | undefined;
	/** The absolute address that always serves `locale`. */
	urlForLocale: (pathname: string, locale: string) => string;
	/** The absolute bare address — `x-default` under `"query"`. */
	bareUrl: (pathname: string) => string;
	/** Apply the fixed precedence to a set of signals. */
	resolve: (signals: LocaleSignals) => string;
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
 *   1. the URL (`?hl=fr`) — an address that names a language always wins,
 *      including over a signed-in user's stored preference. A shared link must
 *      show the recipient the language it names, or the link is a lie and the
 *      hreflang annotation pointing at it is too.
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

type RoutingSlice = Pick<
	LocaleRouting,
	"locales" | "defaultLocale" | "countryLocales" | "isLocale"
>;

/**
 * Turn one raw signal value into a locale. Most signals are already a locale
 * code and only need narrowing; `acceptLanguage` is a header to negotiate and
 * `country` is an ISO code to look up.
 */
const normalize = (
	signal: LocaleSignal,
	raw: string | null | undefined,
	routing: RoutingSlice,
): string | undefined => {
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
export function resolveLocaleFromSignals(
	routing: RoutingSlice,
	signals: LocaleSignals,
): string {
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
export async function resolveLocaleFromSuppliers(
	routing: RoutingSlice,
	suppliers: LocaleSuppliers,
): Promise<string> {
	for (const signal of LOCALE_PRECEDENCE) {
		const supplier = suppliers[signal];
		if (!supplier) continue;
		const locale = normalize(signal, await supplier(), routing);
		if (locale) return locale;
	}
	return routing.defaultLocale;
}

/**
 * Build the routing definition. Hand the result to BOTH your locale resolver
 * and your hreflang config — a `LocaleRouting` is a valid `HreflangConfig`, so
 * the URL you advertise and the URL you serve cannot drift.
 */
export function defineLocaleRouting(config: LocaleRoutingConfig): LocaleRouting {
	const {
		baseUrl,
		locales,
		defaultLocale,
		strategy = "query",
		param = "hl",
		prefixDefaultLocale = false,
		countryLocales = {},
	} = config;

	if (!locales.includes(defaultLocale)) {
		throw new Error(
			`@ingram-tech/nk-i18n: defaultLocale "${defaultLocale}" is not in locales [${locales.join(", ")}].`,
		);
	}

	const isLocale = (value: unknown): boolean =>
		typeof value === "string" && locales.includes(value);

	const bareUrl = (pathname: string): string => absolute(pathname, baseUrl);

	const urlForLocale = (pathname: string, locale: string): string => {
		if (strategy === "prefix") {
			if (locale === defaultLocale && !prefixDefaultLocale)
				return bareUrl(pathname);
			return absolute(`/${locale}${pathname === "/" ? "" : pathname}`, baseUrl);
		}
		const bare = bareUrl(pathname);
		return `${bare}${bare.includes("?") ? "&" : "?"}${param}=${locale}`;
	};

	const localeFromUrl = (url: URL | string): string | undefined => {
		const parsed = typeof url === "string" ? new URL(url, baseUrl) : url;
		if (strategy === "prefix") {
			const found = locales.find(
				(locale) =>
					parsed.pathname === `/${locale}` ||
					parsed.pathname.startsWith(`/${locale}/`),
			);
			if (found) return found;
			return prefixDefaultLocale ? undefined : defaultLocale;
		}
		const value = parsed.searchParams.get(param);
		return isLocale(value) && value !== null ? value : undefined;
	};

	const routing: LocaleRouting = {
		baseUrl,
		locales,
		defaultLocale,
		strategy,
		param,
		prefixDefaultLocale,
		countryLocales,
		isLocale,
		localeFromUrl,
		urlForLocale,
		bareUrl,
		resolve: (signals) => resolveLocaleFromSignals(routing, signals),
	};
	return routing;
}
