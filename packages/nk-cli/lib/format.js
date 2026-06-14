import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { resolveFormatter } from "./formatter.js";
import { run } from "./run.js";

const require = createRequire(import.meta.url);

// House SQL defaults, used only when the site has no Prettier config of its own
// (matches the house tab style + Supabase's Postgres dialect).
const SQL_DEFAULTS = { useTabs: true, language: "postgresql" };

/**
 * `nk format` / `nk format --check`.
 *
 * Code (JS/TS/JSON/CSS) goes through the configured formatter (oxfmt); SQL goes
 * through Prettier, which the code formatter (oxfmt) can't format. Prettier +
 * prettier-plugin-sql are bundled with nk-cli, so they never appear in any app's
 * dependencies — the "no Prettier for code" rule still holds, it's just the one
 * file type oxfmt lacks.
 */
export async function format({ check }) {
	const formatter = resolveFormatter();

	const op = check ? formatter.checkFormat : formatter.write;
	if (op) {
		const code = run(op[0], op[1]);
		if (code !== 0) process.exitCode = code;
	} else {
		console.warn(
			`nk: formatter "${formatter.name}" can't format code yet — skipping (SQL still handled).`,
		);
	}

	await formatSql({ check });
}

/** Format (or, with `check`, verify) every tracked `.sql` file via Prettier. */
export async function formatSql({ check }) {
	const files = sqlFiles();
	if (files.length === 0) return;

	const prettier = require("prettier");
	const pluginPath = require.resolve("prettier-plugin-sql");

	let unformatted = 0;
	let written = 0;
	for (const file of files) {
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
		process.exitCode = 1;
	} else if (!check && written > 0) {
		console.log(`nk: formatted ${written} SQL file(s).`);
	}
}

/** Tracked + untracked-not-ignored `.sql` files; falls back to an fs walk. */
function sqlFiles() {
	const res = spawnSync(
		"git",
		["ls-files", "--cached", "--others", "--exclude-standard", "*.sql"],
		{ encoding: "utf8" },
	);
	if (res.status === 0) {
		return res.stdout
			.split("\n")
			.map((s) => s.trim())
			.filter(Boolean);
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
