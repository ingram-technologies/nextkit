/**
 * Resolves a site-relative path against a base origin; absolute http(s) URLs
 * pass through untouched. The one URL-resolution rule for the whole package —
 * every entry (builders, metadata, routes, hreflang) resolves through here so
 * they can't drift (e.g. trailing-slash `baseUrl` producing `//` paths).
 *
 * Throws when the input escapes the site origin. A protocol-relative path
 * (`//evil.com/x` — which a request to `https://site//evil.com/x` puts into
 * `req.nextUrl.pathname` and thus into `x-pathname`) or a scheme'd value
 * (`javascript:…`) would otherwise flow straight into a canonical/hreflang
 * link, an SEO-hijack primitive once cached. Loud beats poisoned.
 */
export const absoluteUrl = (path: string, baseUrl: string): string => {
	if (/^https?:\/\//.test(path)) return path;
	const base = new URL(baseUrl);
	const resolved = new URL(path, base);
	if (resolved.origin !== base.origin) {
		throw new Error(
			`@ingram-tech/nk-seo: "${path}" resolves outside the site origin ${base.origin}`,
		);
	}
	return resolved.toString();
};
