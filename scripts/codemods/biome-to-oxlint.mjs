#!/usr/bin/env node
/**
 * Codemod: migrate a consuming site from @ingram-tech/biome-config (Biome) to
 * @ingram-tech/oxlint-config (oxlint + oxfmt). Run it from the site's root:
 *
 *   bunx --bun https://raw.githubusercontent.com/ingram-technologies/nextkit/main/scripts/codemods/biome-to-oxlint.mjs
 *
 * …or copy this file in and `bun run` it. It is idempotent-ish: it won't
 * clobber an existing `.oxlintrc.json` / `.oxfmtrc.json` (it warns instead).
 *
 * What it does, all in the current directory:
 *   1. package.json — swap the deps (biome-config + @biomejs/biome → oxlint-config
 *      + oxlint + oxfmt) and rewrite any direct `biome …` scripts.
 *   2. Write `.oxlintrc.json` extending the shared config (relative path — oxlint
 *      does not resolve package specifiers in `extends`).
 *   3. Write `.oxfmtrc.json` (oxfmt has no `extends`, so the house config is
 *      copied in — it's tiny and stable).
 *   4. Delete the old `biome.json`.
 *
 * It does NOT run `bun install`; do that yourself afterwards, then `bun run check`.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const cwd = process.cwd();
const log = (msg) => console.log(`[oxlint-codemod] ${msg}`);

// The house oxfmt config, kept in sync with @ingram-tech/oxlint-config/oxfmtrc.json.
const OXFMTRC = {
	useTabs: true,
	tabWidth: 4,
	printWidth: 88,
	singleQuote: false,
	jsxSingleQuote: false,
	quoteProps: "as-needed",
	trailingComma: "all",
	semi: true,
	arrowParens: "always",
	bracketSameLine: false,
	bracketSpacing: true,
	sortPackageJson: false,
	sortImports: false,
	sortTailwindcss: false,
	ignorePatterns: [
		"**/*.md",
		"**/*.mdx",
		"**/*.yaml",
		"**/*.yml",
		"**/*.toml",
		"**/*.html",
		"dist",
		".next",
		"build",
	],
};

const OXLINTRC = {
	$schema: "./node_modules/oxlint/configuration_schema.json",
	extends: ["./node_modules/@ingram-tech/oxlint-config/oxlintrc.json"],
	ignorePatterns: ["dist", ".next"],
};

/** Write `value` as house-formatted JSON (tabs, trailing newline). */
const writeJson = (file, value) =>
	writeFileSync(file, `${JSON.stringify(value, null, "\t")}\n`);

// 1. package.json — deps + scripts.
const pkgPath = resolve(cwd, "package.json");
if (!existsSync(pkgPath)) {
	console.error("[oxlint-codemod] no package.json here — run from the site root.");
	process.exit(1);
}
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

for (const field of ["dependencies", "devDependencies"]) {
	const deps = pkg[field];
	if (!deps) continue;
	delete deps["@ingram-tech/biome-config"];
	delete deps["@biomejs/biome"];
}
pkg.devDependencies = {
	...pkg.devDependencies,
	"@ingram-tech/oxlint-config": "^0.1.0",
	oxfmt: "^0.54.0",
	oxlint: "^1.69.0",
};
// Sort devDependencies so the diff is stable and keys stay tidy.
pkg.devDependencies = Object.fromEntries(
	Object.entries(pkg.devDependencies).sort(([a], [b]) => a.localeCompare(b)),
);

// Rewrite any direct `biome …` scripts (sites on `nk` won't have these).
const SCRIPT_REWRITES = [
	[/\bbiome\s+check\s+\.?/g, "oxlint && oxfmt --check ."],
	[/\bbiome\s+format\s+--write\s+\.?/g, "oxfmt --write ."],
	[/\bbiome\s+format\s+\.?/g, "oxfmt --check ."],
	[/\bbiome\s+lint\s+\.?/g, "oxlint"],
];
if (pkg.scripts) {
	for (const [name, body] of Object.entries(pkg.scripts)) {
		let next = body;
		for (const [re, to] of SCRIPT_REWRITES) next = next.replace(re, to);
		if (next !== body) {
			pkg.scripts[name] = next;
			log(`script "${name}": ${body} → ${next}`);
		}
	}
}
writeJson(pkgPath, pkg);
log("package.json updated (deps swapped).");

// 2. .oxlintrc.json
const oxlintPath = resolve(cwd, ".oxlintrc.json");
if (existsSync(oxlintPath)) {
	log("`.oxlintrc.json` already exists — left as-is; reconcile manually.");
} else {
	writeJson(oxlintPath, OXLINTRC);
	log("wrote .oxlintrc.json");
}

// 3. .oxfmtrc.json
const oxfmtPath = resolve(cwd, ".oxfmtrc.json");
if (existsSync(oxfmtPath)) {
	log("`.oxfmtrc.json` already exists — left as-is; reconcile manually.");
} else {
	writeJson(oxfmtPath, OXFMTRC);
	log("wrote .oxfmtrc.json");
}

// 4. remove biome.json
const biomePath = resolve(cwd, "biome.json");
if (existsSync(biomePath)) {
	rmSync(biomePath);
	log("removed biome.json");
}

log("done. Next: `bun install`, then `bun run check`.");
log("Any inline `biome-ignore` comments must become `oxlint-disable-next-line`.");
