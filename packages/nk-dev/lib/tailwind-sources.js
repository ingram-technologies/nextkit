import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

// Tailwind v4 declares what to scan for classes in CSS: `@source "<path>"`,
// resolved against the stylesheet that carries it. A path that matches nothing
// is not an error — the scan simply yields no files, so every utility only
// those files use is dropped from the build. Nothing else notices: oxlint and
// tsc do not read CSS, knip walks imports, and `next build` exits 0 with a
// smaller stylesheet. The page just renders unstyled. So resolve them here.

const SKIP_DIRS = new Set([
	"node_modules",
	".next",
	".git",
	"dist",
	"build",
	"coverage",
	".turbo",
	".vercel",
]);

// `@source "x"`, `@source not "x"`. `@source inline(...)` names class names
// rather than files, and has no quote in that position, so it never matches.
const SOURCE_RE = /@source\s+(?:not\s+)?(?:"([^"]+)"|'([^']+)')/g;
const GLOB = /[*?[\]{}]/;

/** Every .css file under `dir`, skipping generated and vendored trees. */
function cssFiles(dir, out = []) {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (SKIP_DIRS.has(entry.name)) continue;
			cssFiles(full, out);
		} else if (entry.name.endsWith(".css")) out.push(full);
	}
	return out;
}

/**
 * The part of a source path that must exist on disk: everything before the
 * first globbed segment, so `../ui/src/**\/*.tsx` is checked as `../ui/src`.
 */
function literalPrefix(path) {
	const segments = path.split("/");
	const stop = segments.findIndex((s) => GLOB.test(s));
	return (stop === -1 ? segments : segments.slice(0, stop)).join("/");
}

/**
 * Findings for the repo at `cwd`: one per `@source` that resolves to nothing.
 * Each is `{ file, source, resolved }`, `file` relative to `cwd`.
 */
export function tailwindSourceFindings(cwd = process.cwd()) {
	const out = [];
	for (const file of cssFiles(cwd)) {
		let css;
		try {
			css = readFileSync(file, "utf8");
		} catch {
			continue;
		}
		if (!css.includes("@source")) continue;
		for (const match of css.matchAll(SOURCE_RE)) {
			const source = match[1] ?? match[2];
			const prefix = literalPrefix(source);
			// A wholly globbed path (`**/*.tsx`) names no directory to check.
			if (prefix === "") continue;
			const resolved = isAbsolute(prefix)
				? prefix
				: resolve(dirname(file), prefix);
			if (existsSync(resolved)) continue;
			out.push({
				file: relative(cwd, file).split(sep).join("/"),
				source,
				resolved,
			});
		}
	}
	return out;
}
