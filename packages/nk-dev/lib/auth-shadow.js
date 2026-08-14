import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

// In the App Router a static segment always beats a catch-all, so a page (or
// route.ts) under `app/auth/` whose path matches a Better Auth endpoint
// silently shadows it: GETs render the page, POSTs to the endpoint return 405,
// and nothing at build time says so. The endpoint list is derived textually
// from better-auth's dist (grep for `createAuthEndpoint("...")`) — we never
// load or execute site or dependency code just to read a set of strings.

const PAGE_FILES = /^page\.(tsx|jsx|ts|js)$/;
const ROUTE_FILES = /^route\.(ts|js)$/;
const ENDPOINT_RE = /createAuthEndpoint\(\s*"([^"]+)"/g;

/** The `app/auth/[...all]` mount dir, or null when the site has no auth mount. */
function findMount(cwd) {
	for (const appDir of ["src/app", "app"]) {
		const catchAll = resolve(cwd, appDir, "auth", "[...all]");
		for (const ext of ["ts", "js", "tsx", "jsx"]) {
			if (existsSync(join(catchAll, `route.${ext}`))) {
				return { appDir, authDir: resolve(cwd, appDir, "auth") };
			}
		}
	}
	return null;
}

/** better-auth's dist dir resolved from the site, or null when not installed. */
function betterAuthDist(cwd) {
	try {
		const require = createRequire(resolve(cwd, "package.json"));
		const pkg = require.resolve("better-auth/package.json");
		return join(dirname(pkg), "dist");
	} catch {
		return null;
	}
}

/** All `createAuthEndpoint("...")` paths in the `.mjs` files under `dir`. */
function grepEndpoints(dir, recurse) {
	if (!existsSync(dir)) return [];
	const paths = new Set();
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (recurse) for (const p of grepEndpoints(full, true)) paths.add(p);
			continue;
		}
		if (!entry.name.endsWith(".mjs")) continue;
		const src = readFileSync(full, "utf8");
		for (const m of src.matchAll(ENDPOINT_RE)) paths.add(m[1]);
	}
	return [...paths];
}

/**
 * Walk `app/auth/**` collecting the page/route files that claim a static URL,
 * as `{ file, segments }` with `file` relative to `cwd`. Skips the `[...all]`
 * catch-all itself, `_private` folders, and `@slot` parallel-route trees (a
 * slot renders alongside the layout rather than owning the URL segment, so we
 * conservatively leave those trees to the human); `(group)` segments don't
 * appear in the URL and are dropped.
 */
function collectRoutes(cwd, dir, segments, out) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "[...all]") continue;
			if (entry.name.startsWith("_") || entry.name.startsWith("@")) continue;
			const next = /^\(.*\)$/.test(entry.name)
				? segments
				: [...segments, entry.name];
			collectRoutes(cwd, full, next, out);
			continue;
		}
		if (!PAGE_FILES.test(entry.name) && !ROUTE_FILES.test(entry.name)) continue;
		if (segments.length === 0) continue; // `/auth` itself can't match an endpoint
		out.push({ file: full.slice(cwd.length + 1), segments });
	}
}

/**
 * Whether a page's segments match an endpoint path: same segment count, where
 * an endpoint `:param` matches any page segment and a page `[param]` (or
 * catch-all) matches any endpoint segment.
 */
function shadows(segments, endpoint) {
	const eps = endpoint.split("/").filter(Boolean);
	if (eps.length !== segments.length) return false;
	return eps.every((ep, i) => {
		const seg = segments[i];
		if (ep.startsWith(":")) return true;
		if (/^\[.*\]$/.test(seg)) return true;
		return seg === ep;
	});
}

/**
 * Findings for Better Auth endpoint shadowing. Silent on sites without an
 * `app/auth/[...all]` mount or without better-auth installed. Core endpoints
 * (dist/api/routes) shadow as errors; plugin endpoints (dist/plugins) as
 * warnings, since only enabled plugins are live and we can't tell which those
 * are without executing the site's auth config.
 */
export function authShadowFindings(cwd) {
	const mount = findMount(cwd);
	if (!mount) return [];
	const dist = betterAuthDist(cwd);
	if (!dist) return [];

	const core = grepEndpoints(join(dist, "api", "routes"), false);
	if (core.length === 0) {
		return [
			{
				id: "auth:shadow-check-skipped",
				level: "warn",
				message:
					"could not derive Better Auth's endpoint list from better-auth/dist/api/routes (layout changed?) — the endpoint-shadowing check was skipped",
			},
		];
	}
	const plugin = grepEndpoints(join(dist, "plugins"), true);

	const routes = [];
	collectRoutes(cwd, mount.authDir, [], routes);

	const out = [];
	for (const { file, segments } of routes) {
		const routePath = `/${segments.join("/")}`;
		const hit = core.find((ep) => shadows(segments, ep));
		if (hit) {
			out.push({
				id: `auth:endpoint-shadow:${routePath}`,
				level: "error",
				message: `\`${file}\` shadows Better Auth's \`/auth${hit}\` endpoint — a static segment beats the \`[...all]\` catch-all, so POSTs to it return 405 and the auth flow silently breaks. Rename the page (the precedent: the reset page is \`/auth/set-password\` because \`/auth/reset-password\` is taken).`,
			});
			continue;
		}
		const pluginHit = plugin.find((ep) => shadows(segments, ep));
		if (pluginHit) {
			out.push({
				id: `auth:endpoint-shadow-plugin:${routePath}`,
				level: "warn",
				message: `\`${file}\` would shadow the Better Auth plugin endpoint \`/auth${pluginHit}\` — only a problem if the site enables that plugin, but a rename now avoids the 405 later.`,
			});
		}
	}
	return out;
}
