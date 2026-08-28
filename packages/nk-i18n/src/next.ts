/**
 * Next.js wiring for {@link LocaleRouting}: one middleware helper, the
 * server-component resolver, and the matching hreflang config.
 *
 * The rule this module enforces: a URL that names a locale SERVES that locale,
 * with a 200. It is never redirected away. Redirecting `?hl=fr` (or `/fr/…`) to
 * the bare path makes every hreflang annotation on the site point at a URL that
 * does not serve the language it claims, and Google drops the non-default
 * languages entirely.
 */
import { cookies, headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import type { LocaleRouting, LocaleSupplier } from "./routing.js";
import { resolveLocaleFromSuppliers } from "./routing.js";

/**
 * Request header carrying the locale the URL named, from middleware to the
 * server components that render it. A request header, not a response one:
 * `headers()` in a server component only sees what middleware forwarded.
 */
export const LOCALE_URL_HEADER = "x-nk-url-locale";

/**
 * Request header carrying the pathname, which `@ingram-tech/nk-seo`'s
 * `<HreflangLinks>` reads. Set alongside the locale header rather than by hand,
 * because two conventions wired separately is how one gets forgotten.
 */
export const PATHNAME_HEADER = "x-pathname";

/** Vercel's geo header, the default source for the country signal. */
const VERCEL_COUNTRY_HEADER = "x-vercel-ip-country";

/** Cookie lifetime for a remembered language choice: one year. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Set the request headers server components need: the pathname, and the locale
 * the URL names (or nothing, on the bare negotiating path).
 *
 * Set-or-delete, never pass through: these headers are ours to mint, so a
 * client that sends one of its own must not reach the app.
 *
 * Returns the locale the URL named, for callers that want to branch. Most
 * middleware should call {@link localeProxy} instead, which wraps this.
 */
export function forwardRequestContext<L extends string>(
	routing: LocaleRouting<L>,
	request: NextRequest,
	requestHeaders: Headers,
): L | undefined {
	requestHeaders.set(PATHNAME_HEADER, request.nextUrl.pathname);
	const locale = routing.localeFromUrl(request.nextUrl);
	if (locale) {
		requestHeaders.set(LOCALE_URL_HEADER, locale);
	} else {
		requestHeaders.delete(LOCALE_URL_HEADER);
	}
	return locale;
}

export interface LocaleProxyOptions {
	/**
	 * Headers to forward to the app, if the middleware has its own to add. A
	 * fresh copy of the request's headers is used when omitted; pass your own
	 * when you also set things like a tenant header.
	 */
	requestHeaders?: Headers;
}

/**
 * The whole middleware side of locale routing, in one call.
 *
 * - forwards the pathname and URL-locale headers;
 * - under `"prefix"`, rewrites `/fr/about` to `/about` so the app keeps one
 *   route tree and never learns what a locale is;
 * - remembers an explicit choice in the cookie, for the visitor's later visits
 *   to a bare path. That is a write, not a read: the URL already decided THIS
 *   request, since it outranks the cookie.
 *
 * It never redirects. The bare path negotiates and every `/fr/…` or `?hl=fr`
 * address serves its language directly, so there is nothing to consolidate.
 *
 *   export function proxy(request: NextRequest) {
 *     return localeProxy(routing, request);
 *   }
 *
 * Middleware that does more of its own work passes its headers in and keeps
 * editing the response:
 *
 *   const requestHeaders = new Headers(request.headers);
 *   requestHeaders.set("x-tenant", tenant);
 *   const response = localeProxy(routing, request, { requestHeaders });
 *   response.cookies.set(…);
 *   return response;
 */
export function localeProxy<L extends string>(
	routing: LocaleRouting<L>,
	request: NextRequest,
	options: LocaleProxyOptions = {},
): NextResponse {
	const requestHeaders = options.requestHeaders ?? new Headers(request.headers);
	const locale = forwardRequestContext(routing, request, requestHeaders);

	const stripped = routing.stripLocale(request.nextUrl.pathname);
	const init = { request: { headers: requestHeaders } };

	const response =
		stripped === request.nextUrl.pathname
			? NextResponse.next(init)
			: NextResponse.rewrite(
					new URL(`${stripped}${request.nextUrl.search}`, request.nextUrl),
					init,
				);

	if (locale) {
		response.cookies.set(routing.cookieName, locale, {
			path: "/",
			maxAge: COOKIE_MAX_AGE,
			sameSite: "lax",
		});
	}
	return response;
}

/**
 * The locale the current URL names, or `undefined` on the bare negotiating path.
 *
 * This, not the negotiated locale, is what a canonical tag must follow. A
 * canonical is a statement about an address: `/pricing` canonicalizes to
 * `/pricing` even while it renders French for a French visitor.
 */
export async function getUrlLocale<L extends string>(
	routing: LocaleRouting<L>,
): Promise<L | undefined> {
	const value = (await headers()).get(LOCALE_URL_HEADER);
	return routing.isLocale(value) ? value : undefined;
}

export interface LocaleResolverOptions {
	/**
	 * The signed-in user's stored preference. Only called when the URL did not
	 * name a locale, so a localized address costs no database round trip.
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
 * Build the request-scoped locale resolver, narrowed to the site's locale
 * union. Wrap the result in React's `cache()` if you call it more than once per
 * render.
 *
 *   export const resolveLocale = cache(
 *     createLocaleResolver(routing, { account: () => getProfile().locale }),
 *   );
 */
export function createLocaleResolver<L extends string>(
	routing: LocaleRouting<L>,
	options: LocaleResolverOptions = {},
): () => Promise<L> {
	const { account, country } = options;

	return () =>
		resolveLocaleFromSuppliers(routing, {
			url: async () => (await headers()).get(LOCALE_URL_HEADER),
			account,
			cookie: async () => (await cookies()).get(routing.cookieName)?.value,
			acceptLanguage: async () => (await headers()).get("accept-language"),
			country:
				country ?? (async () => (await headers()).get(VERCEL_COUNTRY_HEADER)),
		});
}

/**
 * The hreflang config for the page being rendered, with `currentLocale` set from
 * the URL rather than from negotiation. Spread it into `<HreflangLinks>` (from
 * `@ingram-tech/nk-seo/components`); the pathname comes from the header
 * {@link localeProxy} already set, so there is nothing else to wire.
 *
 *   <HreflangLinks {...(await hreflangConfigFor(routing))} />
 *
 * Going through here is what keeps the advertised URLs and the served URLs the
 * same strings, and what keeps canonicals following the address instead of the
 * rendered language.
 */
export async function hreflangConfigFor<L extends string>(
	routing: LocaleRouting<L>,
): Promise<{
	baseUrl: string;
	locales: readonly string[];
	strategy: LocaleRouting<L>["strategy"];
	param: string;
	hrefLangTags: Readonly<Partial<Record<string, string>>> | undefined;
	currentLocale: string | undefined;
}> {
	return {
		baseUrl: routing.baseUrl,
		locales: routing.locales,
		strategy: routing.strategy,
		param: routing.param,
		hrefLangTags: routing.hrefLangTags,
		currentLocale: await getUrlLocale(routing),
	};
}
