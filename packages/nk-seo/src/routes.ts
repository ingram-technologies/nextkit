import type { MetadataRoute } from "next";

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

/** A sitemap entry. A bare string is shorthand for `{ path }`. */
export interface SitemapRoute {
	/** Site-relative path (e.g. "/pricing") or an absolute URL. */
	path: string;
	lastModified?: string | Date;
	changeFrequency?: ChangeFrequency;
	/** 0.0–1.0. Defaults to 1 for "/" and {@link SitemapConfig.defaultPriority} otherwise. */
	priority?: number;
}

export interface SitemapConfig {
	/** Absolute site origin, e.g. "https://peppo.st". */
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

const toAbsolute = (path: string, baseUrl: string): string =>
	/^https?:\/\//.test(path) ? path : new URL(path, baseUrl).toString();

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
		return {
			url: toAbsolute(route.path, config.baseUrl),
			...(lastModified ? { lastModified } : {}),
			...(changeFrequency ? { changeFrequency } : {}),
			priority,
		};
	});
}

export interface RobotsConfig {
	/** Absolute site origin, e.g. "https://peppo.st". */
	baseUrl: string;
	/**
	 * Whether this deployment is the canonical production host. When false, the
	 * whole site is disallowed so preview / sandbox / branch deployments never
	 * get indexed and dilute the real domain with duplicate content. Derive it
	 * from `VERCEL_ENV === "production"` (and/or a host check).
	 */
	isProduction: boolean;
	/** Prod-only disallow list (private routes, APIs, auth flows). */
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
	const sitemapPath =
		config.sitemapPath === undefined ? "/sitemap.xml" : config.sitemapPath;
	return {
		rules: {
			userAgent: "*",
			allow: config.allow ?? "/",
			...(config.disallow?.length ? { disallow: config.disallow } : {}),
		},
		...(sitemapPath ? { sitemap: toAbsolute(sitemapPath, config.baseUrl) } : {}),
		host: config.baseUrl,
	};
}
