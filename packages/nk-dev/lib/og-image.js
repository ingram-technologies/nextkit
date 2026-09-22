import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Next attaches an `opengraph-image.*` file to the segment that declares it,
// and a page's or layout's own `openGraph` object replaces the inherited one
// rather than merging into it. So a metadata object that sets `openGraph` (or
// `twitter`) without `images` emits a card with title, description and
// `summary_large_image` but no `og:image` unless the image file sits in that
// same directory, and every unfurler renders that as a blank placeholder. The
// build is green and the home page, next to the image, looks right; only the
// routes people actually paste (login, docs, tools) are broken. We read the
// metadata declaration textually, as auth-shadow reads better-auth's dist.

const PAGE_OR_LAYOUT = /^(layout|page)\.(tsx|jsx|ts|js)$/;
const IMAGE_FILE = /^opengraph-image\d*\.(tsx|jsx|ts|js|png|jpe?g|gif)$/;
const DECLARES_CARD = /\b(openGraph|twitter)\s*:/;
const CARRIES_IMAGE = /\bimages\s*[:,}]|\bogImageMetadata\s*\(/;

/** The site's app directory, or null when it has none. */
function findAppDir(cwd) {
	for (const rel of ["src/app", "app"]) {
		const dir = resolve(cwd, rel);
		if (existsSync(dir)) return dir;
	}
	return null;
}

/**
 * Walk the route tree collecting page/layout files that declare a card
 * without an image in reach. `nearest` is the closest ancestor (or own)
 * directory holding an image file, for the hint. `_private` folders and
 * `@slot` trees are skipped: a slot's metadata resolution is its own story.
 */
function collect(cwd, dir, segments, nearest, out) {
	const entries = readdirSync(dir, { withFileTypes: true });
	const ownImage = entries.find((e) => e.isFile() && IMAGE_FILE.test(e.name));
	const here = ownImage ? join(dir, ownImage.name) : null;

	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules") continue;
			if (entry.name.startsWith("_") || entry.name.startsWith("@")) continue;
			const next = /^\(.*\)$/.test(entry.name)
				? segments
				: [...segments, entry.name];
			collect(cwd, full, next, here ?? nearest, out);
			continue;
		}
		if (!PAGE_OR_LAYOUT.test(entry.name)) continue;
		if (here) continue; // the file convention wins in its own segment
		const src = readFileSync(full, "utf8");
		if (!DECLARES_CARD.test(src) || CARRIES_IMAGE.test(src)) continue;
		out.push({
			file: full.slice(cwd.length + 1),
			route: `/${segments.join("/")}`,
			nearest: nearest ? nearest.slice(cwd.length + 1) : null,
		});
	}
}

/**
 * Findings for OG cards that advertise an image they don't carry. Silent on
 * sites without an app directory.
 */
export function ogImageFindings(cwd) {
	const appDir = findAppDir(cwd);
	if (!appDir) return [];
	const hits = [];
	collect(cwd, appDir, [], null, hits);
	return hits.map(({ file, route, nearest }) => {
		const fix = nearest
			? `it inherits nothing from \`${nearest}\`: a segment's own \`openGraph\` replaces the inherited one. Spread \`images\` into the object (nk-seo's \`ogImageMetadata\`, or \`createMetadata\` with \`defaultImage\`), or move the image file next to it`
			: "no `opengraph-image.*` exists in its directory or above. Add one at the app root (only there does it serve at a stable `/opengraph-image` URL; under a route group Next appends a hash) or set `images` in the object";
		return {
			id: `og:image-missing:${route}`,
			level: "error",
			message: `\`${file}\` declares an Open Graph card with no image, so \`${route}\` unfurls as a blank placeholder in Slack, LinkedIn and iMessage: ${fix}.`,
		};
	});
}
