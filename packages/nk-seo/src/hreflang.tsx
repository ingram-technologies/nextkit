import { headers } from "next/headers";
import { hreflangAlternates, type HreflangConfig } from "./alternates.js";

export interface HreflangLinksProps extends HreflangConfig {
	/**
	 * Path being rendered. Defaults to the `x-pathname` request header (set it in
	 * middleware: `headers.set("x-pathname", req.nextUrl.pathname)`). Pass
	 * explicitly if you don't use that header (e.g. from route params).
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
				'Set the header in middleware (`res.headers.set("x-pathname", req.nextUrl.pathname)`) ' +
				"or pass `pathname` explicitly.",
		);
	}
	const { canonical: canonicalUrl, links } = hreflangAlternates(config, path);

	return (
		<>
			{canonical ? <link rel="canonical" href={canonicalUrl} /> : null}
			{links.map((link) => (
				<link
					key={link.hrefLang}
					rel="alternate"
					hrefLang={link.hrefLang}
					href={link.href}
				/>
			))}
		</>
	);
}
