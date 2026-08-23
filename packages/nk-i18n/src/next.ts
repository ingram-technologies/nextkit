/**
 * Next.js wiring for {@link LocaleRouting}: the middleware side that reads the
 * locale a URL names, and the server-component side that resolves the locale
 * for a request and builds a matching hreflang config.
 *
 * The rule this module exists to enforce: a URL that names a locale SERVES that
 * locale, with a 200. It is never redirected away. Redirecting `?hl=fr` to the
 * bare path is the bug that makes every hreflang annotation on the site point at
 * a URL which does not serve the language it claims, and Google responds by
 * dropping the non-default languages entirely.
 */
import { cookies, headers } from "next/headers";
import type { LocaleRouting, LocaleSupplier } from "./routing.js";
import { resolveLocaleFromSuppliers } from "./routing.js";

/**
 * Request header carrying the locale the URL named, from middleware to the
 * server components that render it. A request header, not a response one:
 * `headers()` in a server component only sees what middleware forwarded.
 */
export const LOCALE_URL_HEADER = "x-nk-url-locale";

/** Vercel's geo header, the default source for the country signal. */
const VERCEL_COUNTRY_HEADER = "x-vercel-ip-country";

/**
 * Middleware: read the locale `url` names and forward it on `requestHeaders`.
 * Returns it too, for callers that want to branch.
 *
 * Set-or-delete, never pass through: the header is ours to mint, so a client
 * that sends one of its own must not reach the app.
 *
 * This deliberately does NOT redirect. Under the `"query"` strategy the bare
 * path is a negotiating entry point and `?hl=xx` addresses are the indexable
 * per-locale ones; both must return 200.
 *
 *   export function proxy(request: NextRequest) {
 *     const requestHeaders = new Headers(request.headers);
 *     forwardUrlLocale(routing, request.nextUrl, requestHeaders);
 *     return NextResponse.next({ request: { headers: requestHeaders } });
 *   }
 */
export function forwardUrlLocale(
	routing: LocaleRouting,
	url: URL,
	requestHeaders: Headers,
): string | undefined {
	const locale = routing.localeFromUrl(url);
	if (locale) {
		requestHeaders.set(LOCALE_URL_HEADER, locale);
	} else {
		requestHeaders.delete(LOCALE_URL_HEADER);
	}
	return locale;
}

/**
 * The locale the current URL names, or `undefined` when it names none — the
 * bare negotiating path under the `"query"` strategy.
 *
 * This, not the negotiated locale, is what a canonical tag must follow. A
 * canonical is a statement about an address; `/pricing` canonicalizes to
 * `/pricing` even while it renders French for a French visitor.
 */
export async function getUrlLocale(
	routing: LocaleRouting,
): Promise<string | undefined> {
	const value = (await headers()).get(LOCALE_URL_HEADER);
	return routing.isLocale(value) && value !== null ? value : undefined;
}

export interface LocaleResolverOptions {
	/** Remembered-choice cookie name. Default `"locale"`. */
	cookieName?: string;
	/**
	 * The signed-in user's stored preference. Only called when the URL did not
	 * name a locale, so a `?hl=` request costs no database round trip.
	 */
	account?: LocaleSupplier;
	/**
	 * ISO-3166 alpha-2 country for the last-resort signal. Defaults to Vercel's
	 * `x-vercel-ip-country`. Only consulted when every stronger signal is silent,
	 * and only for countries present in `routing.countryLocales`.
	 */
	country?: LocaleSupplier;
}

/**
 * Build the request-scoped locale resolver. Wrap the result in React's `cache()`
 * if you call it more than once per render.
 *
 *   export const resolveLocale = cache(
 *     createLocaleResolver(routing, { account: () => getProfile().locale }),
 *   );
 */
export function createLocaleResolver(
	routing: LocaleRouting,
	options: LocaleResolverOptions = {},
): () => Promise<string> {
	const { cookieName = "locale", account, country } = options;

	return () =>
		resolveLocaleFromSuppliers(routing, {
			url: async () => (await headers()).get(LOCALE_URL_HEADER),
			account,
			cookie: async () => (await cookies()).get(cookieName)?.value,
			acceptLanguage: async () => (await headers()).get("accept-language"),
			country:
				country ?? (async () => (await headers()).get(VERCEL_COUNTRY_HEADER)),
		});
}

/**
 * The hreflang config for the page being rendered, with `currentLocale` set from
 * the URL rather than from negotiation. Spread it into `<HreflangLinks>` (from
 * `@ingram-tech/nk-seo/components`) or `hreflangAlternates`:
 *
 *   <HreflangLinks {...(await hreflangConfigFor(routing))} pathname={pathname} />
 *
 * Going through here is what keeps the advertised URLs and the served URLs the
 * same strings, and what keeps canonicals following the address instead of the
 * rendered language.
 */
export async function hreflangConfigFor(routing: LocaleRouting): Promise<{
	baseUrl: string;
	locales: readonly string[];
	defaultLocale: string;
	strategy: "query" | "prefix";
	param: string;
	prefixDefaultLocale: boolean;
	currentLocale: string | undefined;
}> {
	return {
		baseUrl: routing.baseUrl,
		locales: routing.locales,
		defaultLocale: routing.defaultLocale,
		strategy: routing.strategy,
		param: routing.param,
		prefixDefaultLocale: routing.prefixDefaultLocale,
		currentLocale: await getUrlLocale(routing),
	};
}
