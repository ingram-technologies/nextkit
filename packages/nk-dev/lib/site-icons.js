import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// The icon set a site needs is small and fixed (favicon.ico, icon.svg,
// apple-icon, a manifest), and Next serves each from a file convention in
// src/app. What goes wrong is silent: a zero-byte favicon.ico serves a 200 with
// nothing in it for a year, a 1×1 placeholder icon.svg wins over the real
// favicon and blanks the tab, a missing apple-icon makes iOS screenshot the page
// for a home-screen tile, and a hand-written `metadata.icons` block next to the
// files emits every tag twice. None of that fails a build, so doctor checks it,
// in every site of a workspace as well as a single-site repo.

const APPLE_ICON = /^apple-icon\d*\.(png|jpe?g|tsx|jsx|ts|js)$/;
const APP_ICON = /^(favicon\.ico|icon\d*\.(ico|png|jpe?g|svg|tsx|jsx|ts|js))$/;
const MANIFEST = /^manifest\.(ts|js|json|webmanifest)$/;
const ICONS_KEY = /\bicons\s*:/;
const SVG_DRAWS = /<(path|circle|rect|ellipse|polygon|polyline|line|text|image|use)\b/i;

const dependsOnNext = (pkg) =>
	Boolean(pkg?.dependencies?.next ?? pkg?.devDependencies?.next);

const listDir = (dir) => {
	try {
		return readdirSync(dir);
	} catch {
		return [];
	}
};

const readJson = (path) => {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return null;
	}
};

/** What a file named `.ico` actually holds, from its leading bytes. */
function imageFormat(path) {
	let bytes;
	try {
		if (statSync(path).size < 6) return "empty";
		bytes = readFileSync(path).subarray(0, 12);
	} catch {
		return "empty";
	}
	const hex = bytes.toString("hex");
	if (hex.startsWith("00000100")) return "ico";
	if (hex.startsWith("89504e47")) return "png";
	if (hex.startsWith("ffd8ff")) return "jpeg";
	if (hex.startsWith("47494638")) return "gif";
	if (hex.startsWith("52494646") && bytes.subarray(8, 12).toString() === "WEBP")
		return "webp";
	return "unknown";
}

/** Member directories of a workspace root (`apps/*` and literal paths). */
function workspaceMembers(cwd, pkg) {
	const ws = pkg?.workspaces;
	const patterns = Array.isArray(ws)
		? ws
		: Array.isArray(ws?.packages)
			? ws.packages
			: [];
	const dirs = [];
	for (const pattern of patterns) {
		if (pattern.startsWith("!")) continue;
		if (pattern.endsWith("/*")) {
			const parent = pattern.slice(0, -2);
			for (const name of listDir(resolve(cwd, parent))) {
				dirs.push(join(parent, name));
			}
		} else if (!pattern.includes("*")) {
			dirs.push(pattern);
		}
	}
	return dirs.filter((rel) => existsSync(resolve(cwd, rel, "package.json")));
}

/** Findings for one site; `where` prefixes ids and messages inside a workspace. */
function siteFindings(dir, pkg, where) {
	const appDir = resolve(dir, "src/app");
	if (!dependsOnNext(pkg) || !existsSync(appDir)) return [];
	const app = listDir(appDir);
	const pub = listDir(resolve(dir, "public"));
	const at = where ? `${where}/` : "";
	const out = [];
	const add = (id, level, message) =>
		out.push({
			id: where ? `${id}:${where}` : id,
			level,
			message: where ? `${where}: ${message}` : message,
		});

	const favicon = ["src/app", "public"]
		.map((d) => `${d}/favicon.ico`)
		.find((rel) => existsSync(resolve(dir, rel)));
	if (!favicon) {
		add(
			"icons:favicon-missing",
			"warn",
			'no `favicon.ico`. Browsers, crawlers and feed readers request `/favicon.ico` whatever the `<link>` tags say. Add a 16/32/48 px ICO at `src/app/favicon.ico` (see the nk-seo README, "Site icons").',
		);
	} else {
		const format = imageFormat(resolve(dir, favicon));
		if (format === "png") {
			add(
				"icons:favicon-not-ico",
				"warn",
				`\`${at}${favicon}\` is a PNG renamed to \`.ico\`. Browsers show it, but crawlers, feed readers and older clients expect a real ICO. Convert it (see the nk-seo README, "Site icons").`,
			);
		} else if (format !== "ico") {
			const what = format === "empty" ? "empty" : `a ${format} file, not an ICO`;
			add(
				"icons:favicon-invalid",
				"error",
				`\`${at}${favicon}\` is ${what}, so many clients get a broken icon for \`/favicon.ico\`. Regenerate it from the site's mark (see the nk-seo README, "Site icons").`,
			);
		}
	}

	if (app.includes("icon.svg")) {
		const svg = readFileSync(resolve(appDir, "icon.svg"), "utf8");
		if (!SVG_DRAWS.test(svg)) {
			add(
				"icons:icon-svg-blank",
				"error",
				`\`${at}src/app/icon.svg\` draws nothing. Modern browsers prefer it over \`favicon.ico\`, so the tab icon is blank. Replace it with the real mark, or delete it.`,
			);
		}
	}

	if (
		!app.some((name) => APPLE_ICON.test(name)) &&
		!pub.includes("apple-touch-icon.png")
	) {
		add(
			"icons:apple-icon-missing",
			"warn",
			"no `src/app/apple-icon.png`. iOS uses a screenshot of the page for home-screen and favourites tiles, and password managers fall back to a letter. Add a 180×180 opaque PNG.",
		);
	}

	if (!app.some((name) => MANIFEST.test(name))) {
		add(
			"icons:manifest-missing",
			"warn",
			'no `src/app/manifest.ts`. Android and Chrome have no icon for "Add to home screen". Export nk-seo\'s `createManifest` from it.',
		);
	}

	const layout = ["layout.tsx", "layout.jsx", "layout.ts", "layout.js"].find((name) =>
		app.includes(name),
	);
	if (layout && app.some((name) => APP_ICON.test(name))) {
		const src = readFileSync(resolve(appDir, layout), "utf8");
		if (ICONS_KEY.test(src)) {
			add(
				"icons:metadata-duplicates-files",
				"warn",
				`\`${at}src/app/${layout}\` declares \`metadata.icons\` while icon files sit in \`src/app\`. Next already emits tags for the files, so the page carries both sets. Delete the \`icons\` block and let the file conventions speak.`,
			);
		}
	}

	return out;
}

/**
 * Findings for a site's icon set. At a workspace root, every member that is a
 * Next site with `src/app` is checked, so one `nk doctor` covers the monorepo.
 */
export function siteIconFindings(cwd, pkg) {
	const members = workspaceMembers(cwd, pkg);
	if (members.length === 0) return siteFindings(cwd, pkg, "");
	return [
		...siteFindings(cwd, pkg, ""),
		...members.flatMap((rel) =>
			siteFindings(
				resolve(cwd, rel),
				readJson(resolve(cwd, rel, "package.json")),
				rel,
			),
		),
	];
}
