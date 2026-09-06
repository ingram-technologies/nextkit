import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

// Two ways a stylesheet ends up scanning the wrong thing, both silent.
//
// Tailwind v4 declares what to scan for classes in CSS: `@source "<path>"`,
// resolved against the stylesheet that carries it. A path that matches nothing
// is not an error — the scan simply yields no files, so every utility only
// those files use is dropped from the build. Nothing else notices: oxlint and
// tsc do not read CSS, knip walks imports, and `next build` exits 0 with a
// smaller stylesheet. The page just renders unstyled. So resolve them here.
//
// The same failure has a second shape in a workspace: automatic detection
// scans from the site, never a sibling package, so a component library linked
// in as a workspace dependency is invisible unless some `@source` names it. A
// stylesheet that never mentions it is as broken as one that misspells the
// path, and has even less to notice. So check coverage as well as resolution.

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

const CLASS_EXT = /\.(tsx|jsx|ts|js|mjs|cjs)$/;
const TAILWIND_IMPORT = /@import\s+["']tailwindcss/;

/** The site's dependencies that resolve to a package inside the repo. */
function workspacePackages(cwd) {
	let pkg;
	try {
		pkg = JSON.parse(readFileSync(resolve(cwd, "package.json"), "utf8"));
	} catch {
		return [];
	}
	const names = Object.keys({
		...pkg.dependencies,
		...pkg.devDependencies,
	});
	const out = [];
	for (const name of names) {
		// Walk up for the install that serves this site: bun and npm hoist to
		// the workspace root, so the link is rarely in the site's own tree.
		let dir = cwd;
		for (;;) {
			const candidate = join(dir, "node_modules", name);
			if (existsSync(candidate)) {
				let real;
				try {
					real = realpathSync(candidate);
				} catch {
					break;
				}
				// A linked workspace member resolves outside node_modules; a
				// published dependency stays inside it.
				if (!real.split(sep).includes("node_modules")) {
					out.push({ name, dir: real });
				}
				break;
			}
			const parent = dirname(dir);
			if (parent === dir) break;
			dir = parent;
		}
	}
	return out;
}

/** Whether any source file under `dir` writes a `className`. */
function writesClassNames(dir) {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return false;
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (SKIP_DIRS.has(entry.name)) continue;
			if (writesClassNames(full)) return true;
			continue;
		}
		if (!CLASS_EXT.test(entry.name)) continue;
		try {
			if (readFileSync(full, "utf8").includes("className")) return true;
		} catch {
			/* unreadable file: not evidence either way */
		}
	}
	return false;
}

/** Whether `a` is `b`, contains it, or sits inside it. */
function overlaps(a, b) {
	return a === b || a.startsWith(b + sep) || b.startsWith(a + sep);
}

/**
 * Findings for the repo at `cwd`: one per workspace dependency that writes
 * class names and no tailwind stylesheet scans. Each is `{ name, dir }`, `dir`
 * relative to `cwd`. Empty when the site has no tailwind entry stylesheet.
 */
export function tailwindCoverageFindings(cwd = process.cwd()) {
	const scanned = [];
	let hasEntry = false;
	for (const file of cssFiles(cwd)) {
		let css;
		try {
			css = readFileSync(file, "utf8");
		} catch {
			continue;
		}
		if (!TAILWIND_IMPORT.test(css)) continue;
		hasEntry = true;
		for (const match of css.matchAll(SOURCE_RE)) {
			const prefix = literalPrefix(match[1] ?? match[2]);
			if (prefix === "") continue;
			scanned.push(isAbsolute(prefix) ? prefix : resolve(dirname(file), prefix));
		}
	}
	if (!hasEntry) return [];
	const out = [];
	for (const { name, dir } of workspacePackages(cwd)) {
		if (scanned.some((source) => overlaps(dir, source))) continue;
		if (!writesClassNames(dir)) continue;
		out.push({ name, dir: relative(cwd, dir).split(sep).join("/") });
	}
	return out;
}
