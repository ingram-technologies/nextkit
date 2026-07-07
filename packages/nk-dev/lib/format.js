import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { FORMATTER } from "./formatter.js";
import { run } from "./run.js";

const require = createRequire(import.meta.url);

// House SQL defaults, used only when the site has no Prettier config of its own
// (matches the house tabs/4/88 style + the PostgreSQL dialect; without the
// explicit widths Prettier falls back to 80/2).
const SQL_DEFAULTS = {
	useTabs: true,
	tabWidth: 4,
	printWidth: 88,
	language: "postgresql",
};

/**
 * `nk format` / `nk format --check`.
 *
 * Code (JS/TS/JSON/CSS) goes through oxfmt; SQL goes through Prettier, which
 * oxfmt can't format. Prettier + prettier-plugin-sql are bundled with nk-dev,
 * so they never appear in any app's dependencies — the "no Prettier for code"
 * rule still holds, it's just the one file type oxfmt lacks.
 */
export async function format({ check }) {
	const op = check ? FORMATTER.checkFormat : FORMATTER.write;
	const code = run(op[0], op[1]);
	if (code !== 0) process.exitCode = code;

	if (await formatSql({ check })) process.exitCode = 1;
}

/**
 * Format (or, with `check`, verify) every tracked `.sql` file via Prettier.
 * Returns true when a check found unformatted files — the caller owns the exit
 * code (inferring failure from the `process.exitCode` global misattributes any
 * earlier failure to SQL).
 */
export async function formatSql({ check }) {
	const files = sqlFiles();
	if (files.length === 0) return false;

	const prettier = require("prettier");
	const pluginPath = require.resolve("prettier-plugin-sql");

	let unformatted = 0;
	let written = 0;
	for (const file of files) {
		// git ls-files lists tracked files deleted from the worktree without
		// `git rm`; reading one would throw an unhandled ENOENT.
		if (!existsSync(file)) continue;
		const source = readFileSync(file, "utf8");
		// The site's own .prettierrc / package.json "prettier" wins over our
		// defaults; we always inject the bundled SQL plugin + parser.
		const siteConfig = (await prettier.resolveConfig(file)) ?? {};
		const options = {
			...SQL_DEFAULTS,
			...siteConfig,
			parser: "sql",
			plugins: [
				pluginPath,
				...(siteConfig.plugins ?? []).filter(
					(p) => !String(p).includes("prettier-plugin-sql"),
				),
			],
		};

		if (check) {
			if (!(await prettier.check(source, options))) {
				unformatted++;
				console.error(`  ${relative(process.cwd(), file)}`);
			}
		} else {
			const out = await prettier.format(source, options);
			if (out !== source) {
				writeFileSync(file, out);
				written++;
			}
		}
	}

	if (check && unformatted > 0) {
		console.error(
			`nk: ${unformatted} SQL file(s) need formatting — run \`nk format\`.`,
		);
		return true;
	}
	if (!check && written > 0) {
		console.log(`nk: formatted ${written} SQL file(s).`);
	}
	return false;
}

/** Tracked + untracked-not-ignored `.sql` files; falls back to an fs walk. */
function sqlFiles() {
	// -z: NUL-separated, unquoted — the default output octal-escapes non-ASCII
	// filenames, which then match no real path.
	const res = spawnSync(
		"git",
		["ls-files", "-z", "--cached", "--others", "--exclude-standard", "*.sql"],
		{ encoding: "utf8" },
	);
	if (res.status === 0) {
		return res.stdout.split("\0").filter(Boolean);
	}
	return walkSql(process.cwd());
}

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build"]);

function walkSql(dir, out = []) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (!SKIP_DIRS.has(entry.name)) walkSql(join(dir, entry.name), out);
		} else if (entry.name.endsWith(".sql")) {
			out.push(join(dir, entry.name));
		}
	}
	return out;
}
