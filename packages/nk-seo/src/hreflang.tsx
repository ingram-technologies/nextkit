import { headers } from "next/headers";
import { hreflangAlternates, type HreflangConfig } from "./alternates.js";

export interface HreflangLinksProps extends HreflangConfig {
	/**
	 * Path being rendered. Defaults to the `x-pathname` REQUEST header — it must
	 * be set on the forwarded request in middleware (a response header is
	 * invisible to `headers()`):
	 *
	 * ```ts
	 * const requestHeaders = new Headers(req.headers);
	 * requestHeaders.set("x-pathname", req.nextUrl.pathname);
	 * return NextResponse.next({ request: { headers: requestHeaders } });
	 * ```
	 *
	 * Pass explicitly if you don't use that header (e.g. from route params).
	 * On a statically rendered route the header is empty (and reading it would
	 * otherwise opt the page into dynamic rendering), so a header-reading
	 * instance cannot sit in a layout shared with static pages — prefer
	 * `createMetadata({ hreflang })`, which emits the same cluster from metadata
	 * without any request header.
	 */
	pathname?: string;
	/**
	 * Emit a self-referencing `<link rel="canonical">`. Default `true`.
	 * Disable it if the page's metadata already sets `alternates.canonical`
	 * (e.g. via `createMetadata`) — a page must not declare two canonicals.
	 */
	canonical?: boolean;
}

/**
 * Emits `<link rel="canonical">` plus per-locale `<link rel="alternate" hreflang>`
 * (and an `x-default`) for the current path. Render inside `<head>` (e.g. from
 * the root layout). Server component — reads the `x-pathname` header by default.
 *
 * Throws when neither `pathname` nor the header is available: silently falling
 * back would canonicalize every page to the homepage, a site-wide
 * duplicate-content bug that is otherwise invisible.
 */
export async function HreflangLinks({
	pathname,
	canonical = true,
	...config
}: HreflangLinksProps) {
	const path = pathname ?? (await headers()).get("x-pathname");
	if (!path) {
		throw new Error(
			"HreflangLinks: no `pathname` prop and no `x-pathname` request header. " +
				"Set it on the forwarded REQUEST in middleware — " +
				'`const h = new Headers(req.headers); h.set("x-pathname", req.nextUrl.pathname); ' +
				"return NextResponse.next({ request: { headers: h } });` — " +
				"(a response header is invisible to `headers()`), or pass `pathname` explicitly.",
		);
	}
	const { canonical: canonicalUrl, links } = hreflangAlternates(config, path);

	return (
		<>
			{canonical ? <link rel="canonical" href={canonicalUrl} /> : null}
			{links.map((link) => (
				<link
					// hrefLang alone can collide (two locales mapped to one tag via
					// hrefLangTags), and colliding keys silently drop links.
					key={`${link.hrefLang} ${link.href}`}
					rel="alternate"
					hrefLang={link.hrefLang}
					href={link.href}
				/>
			))}
		</>
	);
}
