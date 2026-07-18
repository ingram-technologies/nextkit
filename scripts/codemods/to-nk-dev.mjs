#!/usr/bin/env node
/**
 * Codemod: consolidate a consuming site onto @ingram-tech/nk-dev — the single
 * dev-toolchain package that replaces the old split packages
 * (@ingram-tech/oxlint-config, typescript-config, test-config, git-hooks,
 * agent-guide, nk-cli) and @ingram-tech/biome-config. Run from the site root:
 *
 *   bun x --bun https://raw.githubusercontent.com/ingram-technologies/nextkit/main/scripts/codemods/to-nk-dev.mjs
 *   bun install
 *   bun run check
 *
 * What it does, all in the current directory:
 *   1. package.json — drop the old @ingram-tech/* dev packages + @biomejs/biome,
 *      add @ingram-tech/nk-dev, and rewrite any direct `biome …` scripts.
 *   2. Rewrite `extends` / import paths in .oxlintrc.json, tsconfig.json, and
 *      vitest.config.* from the old package names to @ingram-tech/nk-dev/*.
 *   3. Rewrite the CLAUDE.md agent-guide @import to nk-dev/guide.md.
 *   4. Create any missing config file (.oxlintrc.json / .oxfmtrc.json), and
 *      delete a leftover biome.json.
 *
 * Anything it can't infer (e.g. a missing tsconfig.json or vitest.config.ts) it
 * leaves to `bun x nk init`. It is idempotent — safe to run twice.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const cwd = process.cwd();
const log = (msg) => console.log(`[to-nk-dev] ${msg}`);

const OLD_DEV_PACKAGES = [
	"@ingram-tech/oxlint-config",
	"@ingram-tech/typescript-config",
	"@ingram-tech/test-config",
	"@ingram-tech/git-hooks",
	"@ingram-tech/agent-guide",
	"@ingram-tech/nk-cli",
	"@ingram-tech/biome-config",
	"@biomejs/biome",
];

// The house oxfmt config, kept in sync with @ingram-tech/nk-dev/oxfmtrc.json.
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
	extends: ["./node_modules/@ingram-tech/nk-dev/oxlintrc.json"],
	ignorePatterns: ["dist", ".next"],
};

/** Write `value` as house-formatted JSON (tabs, trailing newline). */
const writeJson = (file, value) =>
	writeFileSync(file, `${JSON.stringify(value, null, "\t")}\n`);

/**
 * knip can't see config packages as "used" (they're consumed via config files,
 * not imports), so sites list them in `ignoreDependencies`. Swap the old names
 * for @ingram-tech/nk-dev. Returns the (possibly) new array.
 */
function migrateIgnoreDeps(arr) {
	if (!Array.isArray(arr)) return arr;
	const had = arr.some((d) => OLD_DEV_PACKAGES.includes(d));
	const out = arr.filter((d) => !OLD_DEV_PACKAGES.includes(d));
	if (had && !out.includes("@ingram-tech/nk-dev")) out.push("@ingram-tech/nk-dev");
	return out;
}

/** Replace each [regex, replacement] pair in a file if it exists and changed. */
function rewriteFile(rel, pairs) {
	const file = resolve(cwd, rel);
	if (!existsSync(file)) return;
	const before = readFileSync(file, "utf8");
	let after = before;
	for (const [re, to] of pairs) after = after.replace(re, to);
	if (after !== before) {
		writeFileSync(file, after);
		log(`rewrote ${rel}`);
	}
}

// 1. package.json — deps + scripts.
const pkgPath = resolve(cwd, "package.json");
if (!existsSync(pkgPath)) {
	console.error("[to-nk-dev] no package.json here — run from the site root.");
	process.exit(1);
}
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

for (const field of ["dependencies", "devDependencies"]) {
	if (!pkg[field]) continue;
	for (const name of OLD_DEV_PACKAGES) delete pkg[field][name];
}
pkg.devDependencies = {
	...pkg.devDependencies,
	// Under 0.x semver, a ^0.1.0 pin would never match 0.2.x — keep this on
	// nk-dev's current minor when bumping.
	"@ingram-tech/nk-dev": "^0.2.0",
};
pkg.devDependencies = Object.fromEntries(
	Object.entries(pkg.devDependencies).sort(([a], [b]) => a.localeCompare(b)),
);

// Rewrite any direct `biome …` scripts (sites on `nk` won't have these).
const SCRIPT_REWRITES = [
	[/\bbiome\s+check\b/g, "oxlint && oxfmt --check"],
	[/\bbiome\s+format\s+--write\b/g, "oxfmt --write"],
	[/\bbiome\s+format\b/g, "oxfmt --check"],
	[/\bbiome\s+lint\b/g, "oxlint"],
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
// knip config can live in package.json under a "knip" key.
if (pkg.knip?.ignoreDependencies) {
	pkg.knip.ignoreDependencies = migrateIgnoreDeps(pkg.knip.ignoreDependencies);
}
writeJson(pkgPath, pkg);
log("package.json updated (old dev packages → @ingram-tech/nk-dev).");

// 2. Rewrite extends / import paths to the new package.
rewriteFile(".oxlintrc.json", [
	[
		/@ingram-tech\/oxlint-config\/(oxlintrc|oxfmtrc|tier-b)\.json/g,
		"@ingram-tech/nk-dev/$1.json",
	],
]);
rewriteFile("tsconfig.json", [
	[
		/@ingram-tech\/typescript-config\/(base|nextjs)\.json/g,
		"@ingram-tech/nk-dev/tsconfig/$1.json",
	],
]);
for (const vc of ["vitest.config.ts", "vitest.config.js", "vitest.config.mjs"]) {
	rewriteFile(vc, [
		[/@ingram-tech\/test-config\/setup/g, "@ingram-tech/nk-dev/vitest/setup"],
		[/@ingram-tech\/test-config/g, "@ingram-tech/nk-dev/vitest"],
	]);
}

// 3. CLAUDE.md — repoint the agent-guide import (path prefix is preserved).
rewriteFile("CLAUDE.md", [
	[/@ingram-tech\/agent-guide\/guide\.md/g, "@ingram-tech/nk-dev/guide.md"],
]);

// 3b. Standalone knip.json — migrate its ignoreDependencies too.
const knipPath = resolve(cwd, "knip.json");
if (existsSync(knipPath)) {
	try {
		const knip = JSON.parse(readFileSync(knipPath, "utf8"));
		if (knip.ignoreDependencies) {
			knip.ignoreDependencies = migrateIgnoreDeps(knip.ignoreDependencies);
			writeJson(knipPath, knip);
			log("rewrote knip.json (ignoreDependencies)");
		}
	} catch {
		log(
			"knip.json present but not parseable as JSON — update ignoreDependencies by hand.",
		);
	}
}

// 4. Create missing base config; remove a leftover biome.json.
const oxlintPath = resolve(cwd, ".oxlintrc.json");
if (!existsSync(oxlintPath)) {
	writeJson(oxlintPath, OXLINTRC);
	log("wrote .oxlintrc.json");
}
const oxfmtPath = resolve(cwd, ".oxfmtrc.json");
if (!existsSync(oxfmtPath)) {
	writeJson(oxfmtPath, OXFMTRC);
	log("wrote .oxfmtrc.json");
}
const biomePath = resolve(cwd, "biome.json");
if (existsSync(biomePath)) {
	rmSync(biomePath);
	log("removed biome.json");
}

log(
	"done. Next: `bun install`, then `bun x nk init` for anything missing, then `bun run check`.",
);
log("Any inline `biome-ignore` comments must become `oxlint-disable-next-line`.");
