/**
 * Resolves a site-relative path against a base origin; absolute http(s) URLs
 * pass through untouched. The one URL-resolution rule for the whole package —
 * every entry (builders, metadata, routes, hreflang) resolves through here so
 * they can't drift (e.g. trailing-slash `baseUrl` producing `//` paths).
 */
export const absoluteUrl = (path: string, baseUrl: string): string =>
	/^https?:\/\//.test(path) ? path : new URL(path, baseUrl).toString();
