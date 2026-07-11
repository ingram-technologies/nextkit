import type { MetadataRoute } from "next";
import { absoluteUrl } from "./url.js";

/**
 * Route-handler helpers for `app/sitemap.ts` and `app/robots.ts`. Pure — no
 * React — so they live in the package root next to the metadata factory and can
 * be imported by route handlers freely.
 *
 * Both resolve site-relative paths against one `baseUrl` (pass your deployment's
 * own origin, e.g. `getServerUrl()`), so preview / sandbox deployments advertise
 * themselves and never leak the production host.
 */

type ChangeFrequency = NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;

/** hreflang → URL map, keyed by the locale codes Next accepts. */
export type SitemapLanguages = NonNullable<
	NonNullable<MetadataRoute.Sitemap[number]["alternates"]>["languages"]
>;

/** A sitemap entry. A bare string is shorthand for `{ path }`. */
export interface SitemapRoute {
	/** Site-relative path (e.g. "/pricing") or an absolute URL. */
	path: string;
	lastModified?: string | Date;
	changeFrequency?: ChangeFrequency;
	/** 0.0–1.0. Defaults to 1 for "/" and {@link SitemapConfig.defaultPriority} otherwise. */
	priority?: number;
	/**
	 * Per-locale alternates of this route (hreflang → site-relative path or
	 * absolute URL), e.g. `{ en: "/about", fr: "/fr/about" }`. Pairs with
	 * `<HreflangLinks>` / `hreflangAlternates` on the page side.
	 */
	languages?: SitemapLanguages;
}

export interface SitemapConfig {
	/** Absolute site origin, e.g. "https://example.com". */
	baseUrl: string;
	/** The indexable routes. Strings or `SitemapRoute` objects may be mixed. */
	routes: Array<string | SitemapRoute>;
	/** Applied when an entry omits `lastModified`. */
	lastModified?: string | Date;
	/** Applied when an entry omits `changeFrequency`. */
	defaultChangeFrequency?: ChangeFrequency;
	/** Priority for every non-root entry that omits its own. Default 0.7. */
	defaultPriority?: number;
}

const resolveLanguages = (
	languages: SitemapLanguages,
	baseUrl: string,
): SitemapLanguages =>
	// Object.entries/fromEntries erase the hreflang key union; the keys are
	// passed through unchanged (only values are resolved), so restoring it is safe.
	Object.fromEntries(
		Object.entries(languages).map(([locale, path]) => [
			locale,
			path === undefined ? path : absoluteUrl(path, baseUrl),
		]),
	) as SitemapLanguages;

/**
 * Builds a `MetadataRoute.Sitemap` from a list of routes, resolving relative
 * paths against `baseUrl`. `"/"` defaults to priority 1; every other route
 * defaults to `defaultPriority` (0.7).
 *
 * @example
 * // app/sitemap.ts
 * import { createSitemap } from "@ingram-tech/nk-seo";
 * export default () =>
 *   createSitemap({
 *     baseUrl: getServerUrl(),
 *     routes: ["/", "/pricing", "/docs", "/faq"],
 *   });
 */
export function createSitemap(config: SitemapConfig): MetadataRoute.Sitemap {
	const defaultPriority = config.defaultPriority ?? 0.7;
	return config.routes.map((entry) => {
		const route: SitemapRoute = typeof entry === "string" ? { path: entry } : entry;
		const lastModified = route.lastModified ?? config.lastModified;
		const changeFrequency = route.changeFrequency ?? config.defaultChangeFrequency;
		const priority = route.priority ?? (route.path === "/" ? 1 : defaultPriority);
		if (priority < 0 || priority > 1) {
			throw new RangeError(
				`createSitemap: priority must be between 0 and 1, got ${priority} for "${route.path}"`,
			);
		}
		return {
			url: absoluteUrl(route.path, config.baseUrl),
			...(lastModified ? { lastModified } : {}),
			...(changeFrequency ? { changeFrequency } : {}),
			priority,
			...(route.languages
				? {
						alternates: {
							languages: resolveLanguages(
								route.languages,
								config.baseUrl,
							),
						},
					}
				: {}),
		};
	});
}

export interface RobotsConfig {
	/** Absolute site origin, e.g. "https://example.com". */
	baseUrl: string;
	/**
	 * Whether this deployment is the canonical production host. When false, the
	 * whole site is disallowed so preview / sandbox / branch deployments never
	 * get indexed and dilute the real domain with duplicate content. Derive it
	 * from `VERCEL_ENV === "production"` (and/or a host check).
	 */
	isProduction: boolean;
	/**
	 * Prod-only disallow list (private routes, APIs, auth flows). Entries that
	 * would block `/_next` are rejected: crawlers must reach the JS/CSS under it
	 * to render pages, so disallowing it silently harms indexing.
	 */
	disallow?: string[];
	/** Prod allow rule. Default "/". */
	allow?: string | string[];
	/** Sitemap path advertised in prod. Default "/sitemap.xml". Pass null to omit. */
	sitemapPath?: string | null;
}

/**
 * Builds a `MetadataRoute.Robots`. On non-production hosts it returns a
 * blanket `Disallow: /` — the single most-forgotten SEO safeguard on Vercel,
 * where preview and branch URLs are otherwise crawlable and compete with the
 * production domain.
 *
 * @example
 * // app/robots.ts
 * import { createRobots } from "@ingram-tech/nk-seo";
 * export default () =>
 *   createRobots({
 *     baseUrl: getServerUrl(),
 *     isProduction: process.env.VERCEL_ENV === "production",
 *     disallow: ["/api/", "/internal/", "/login"],
 *   });
 */
export function createRobots(config: RobotsConfig): MetadataRoute.Robots {
	if (!config.isProduction) {
		return { rules: { userAgent: "*", disallow: "/" } };
	}
	const nextAsset = config.disallow?.find((path) =>
		path.trim().replace(/^\//, "").startsWith("_next"),
	);
	if (nextAsset !== undefined) {
		throw new Error(
			`createRobots: refusing to disallow "${nextAsset}". Blocking /_next stops ` +
				"crawlers from fetching the JS/CSS they need to render your pages, which " +
				"hurts indexing. Next.js does not block it by default and neither should you.",
		);
	}
	const sitemapPath =
		config.sitemapPath === undefined ? "/sitemap.xml" : config.sitemapPath;
	return {
		rules: {
			userAgent: "*",
			allow: config.allow ?? "/",
			...(config.disallow?.length ? { disallow: config.disallow } : {}),
		},
		...(sitemapPath ? { sitemap: absoluteUrl(sitemapPath, config.baseUrl) } : {}),
	};
}
