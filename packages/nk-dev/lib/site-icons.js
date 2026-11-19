import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

// The icon set a site needs is small and fixed (favicon.ico, icon.svg,
// apple-icon, a manifest), and Next serves each from a file convention in
// src/app. What goes wrong is silent: a zero-byte favicon.ico serves a 200 with
// nothing in it for a year, a missing apple-icon makes iOS screenshot the page
// for a home-screen tile, and a hand-written `metadata.icons` block next to the
// files emits every tag twice. None of that fails a build, so doctor checks it.

const ICO_MAGIC = Buffer.from([0, 0, 1, 0]);
const APPLE_ICON = /^apple-icon\d*\.(png|jpe?g|tsx|jsx|ts|js)$/;
const APP_ICON = /^(favicon\.ico|icon\d*\.(ico|png|jpe?g|svg|tsx|jsx|ts|js))$/;
const MANIFEST = /^manifest\.(ts|js|json|webmanifest)$/;
const ICONS_KEY = /\bicons\s*:/;

const dependsOnNext = (pkg) =>
	Boolean(pkg.dependencies?.next ?? pkg.devDependencies?.next);

const listDir = (dir) => {
	try {
		return readdirSync(dir);
	} catch {
		return [];
	}
};

/** Whether `path` holds an ICO file: the 4-byte header, not just the name. */
function isIco(path) {
	try {
		if (statSync(path).size < 6) return false;
		return readFileSync(path).subarray(0, 4).equals(ICO_MAGIC);
	} catch {
		return false;
	}
}

/** Findings for a site's icon set. Silent unless it is a Next site with src/app. */
export function siteIconFindings(cwd, pkg) {
	const appDir = resolve(cwd, "src/app");
	if (!dependsOnNext(pkg) || !existsSync(appDir)) return [];
	const app = listDir(appDir);
	const pub = listDir(resolve(cwd, "public"));
	const out = [];

	const favicon = ["src/app", "public"]
		.map((dir) => `${dir}/favicon.ico`)
		.find((rel) => existsSync(resolve(cwd, rel)));
	if (!favicon) {
		out.push({
			id: "icons:favicon-missing",
			level: "warn",
			message:
				'no `favicon.ico`. Browsers, crawlers and feed readers request `/favicon.ico` whatever the `<link>` tags say. Add a 16/32/48 px ICO at `src/app/favicon.ico` (see the nk-seo README, "Site icons").',
		});
	} else if (!isIco(resolve(cwd, favicon))) {
		out.push({
			id: "icons:favicon-invalid",
			level: "error",
			message: `\`${favicon}\` is empty or not an ICO file, so every request for \`/favicon.ico\` gets a broken icon. Regenerate it from \`icon.svg\` (see the nk-seo README, "Site icons").`,
		});
	}

	if (
		!app.some((name) => APPLE_ICON.test(name)) &&
		!pub.includes("apple-touch-icon.png")
	) {
		out.push({
			id: "icons:apple-icon-missing",
			level: "warn",
			message:
				"no `src/app/apple-icon.png`. iOS uses a screenshot of the page for home-screen and favourites tiles, and password managers fall back to a letter. Add a 180×180 opaque PNG.",
		});
	}

	if (!app.some((name) => MANIFEST.test(name))) {
		out.push({
			id: "icons:manifest-missing",
			level: "warn",
			message:
				'no `src/app/manifest.ts`. Android and Chrome have no icon for "Add to home screen". Export nk-seo\'s `createManifest` from it.',
		});
	}

	const layout = ["layout.tsx", "layout.jsx", "layout.ts", "layout.js"].find((name) =>
		app.includes(name),
	);
	if (layout && app.some((name) => APP_ICON.test(name))) {
		const src = readFileSync(resolve(appDir, layout), "utf8");
		if (ICONS_KEY.test(src)) {
			out.push({
				id: "icons:metadata-duplicates-files",
				level: "warn",
				message: `\`src/app/${layout}\` declares \`metadata.icons\` while icon files sit in \`src/app\`. Next already emits tags for the files, so the page carries both sets. Delete the \`icons\` block and let the file conventions speak.`,
			});
		}
	}

	return out;
}
