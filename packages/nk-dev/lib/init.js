import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Files live at the package root, two levels up from lib/.
const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const log = (msg) => console.log(`nk init: ${msg}`);
const skip = (file) => console.log(`nk init: ${file} already exists — left as-is.`);

/** Write `value` as house-formatted JSON (tabs, trailing newline). */
function writeJson(file, value) {
	writeFileSync(file, `${JSON.stringify(value, null, "\t")}\n`);
}

/**
 * Write `file` unless it already exists. Returns true if written.
 * `build` produces the contents only when needed.
 */
function writeIfAbsent(file, build) {
	if (existsSync(file)) {
		skip(file);
		return false;
	}
	build(file);
	log(`wrote ${file}`);
	return true;
}

// oxlint resolves `extends` as a path relative to the config file — NOT as a
// package specifier — so it must point into node_modules.
const OXLINTRC = {
	$schema: "./node_modules/oxlint/configuration_schema.json",
	extends: ["./node_modules/@ingram-tech/nk-dev/oxlintrc.json"],
	ignorePatterns: ["dist", ".next"],
};

// TypeScript DOES resolve a package specifier in `extends`, so this stays a
// clean one-liner. But inherited `include`/`exclude`/`paths` would resolve
// relative to the *base* config (inside node_modules), so we declare our own.
const TSCONFIG = {
	extends: "@ingram-tech/nk-dev/tsconfig/nextjs.json",
	compilerOptions: {
		paths: { "@/*": ["./src/*"] },
	},
	include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
	exclude: ["node_modules"],
};

const VITEST_HINT = `import { mergeConfig } from "vitest/config";\\nimport { nextkitTestConfig } from "@ingram-tech/nk-dev/vitest";\\nexport default mergeConfig(nextkitTestConfig, {});`;

// knip has no shareable config, so each site carries its own. This seed ignores
// @ingram-tech/nk-dev: a site that runs raw tools (not the `nk` bin) gives knip
// no way to see nk-dev as used, so without this it'd fail as an unused
// dependency. (Sites that do call `nk` in scripts can drop it — knip will hint.)
// Add `entry`/`ignore` as the project grows.
const KNIP = {
	$schema: "https://unpkg.com/knip@6/schema.json",
	ignoreDependencies: ["@ingram-tech/nk-dev"],
};

const PRE_COMMIT = `#!/bin/sh
# nextkit pre-commit: format staged files with oxfmt, then re-stage them.
# Logic lives in @ingram-tech/nk-dev, so a version bump updates it everywhere.
set -eu
exec bunx --bun nextkit-format-staged
`;

const GUIDE_IMPORT = "@./node_modules/@ingram-tech/nk-dev/guide.md";

export function init() {
	const cwd = process.cwd();

	if (!existsSync(resolve(cwd, "package.json"))) {
		console.error("nk init: no package.json here — run from your project root.");
		process.exit(1);
	}

	// 1. oxlint config (extends the shared rules; add your own below).
	writeIfAbsent(resolve(cwd, ".oxlintrc.json"), (f) => writeJson(f, OXLINTRC));

	// 2. oxfmt config — oxfmt has no `extends`, so the house format config is
	//    copied in. It's tiny and stable; editors auto-discover it too.
	writeIfAbsent(resolve(cwd, ".oxfmtrc.json"), (f) =>
		writeFileSync(f, readFileSync(resolve(PKG_ROOT, "oxfmtrc.json"), "utf8")),
	);

	// 3. TypeScript config.
	writeIfAbsent(resolve(cwd, "tsconfig.json"), (f) => writeJson(f, TSCONFIG));

	// 4. Vitest config — only hint, never auto-write. Many sites test with
	//    `bun:test` rather than Vitest, and an unused vitest.config.ts is noise.
	hintVitestConfig(cwd);

	// 5. knip config (unused deps/exports/files; run by `nk check`).
	writeIfAbsent(resolve(cwd, "knip.json"), (f) => writeJson(f, KNIP));

	// 6. Format-on-commit hook + git wiring.
	setupGitHook(cwd);

	// 7. Make sure the agent guide is imported into CLAUDE.md.
	ensureGuideImport(cwd);

	// 8. A `prepare` script so the hook re-wires itself on every `bun install`.
	ensurePrepareScript(cwd);

	log("done. Next: `bun install`, then `nk check`.");
}

function setupGitHook(cwd) {
	const hookDir = resolve(cwd, ".githooks");
	const hook = resolve(hookDir, "pre-commit");
	if (!existsSync(hook)) {
		mkdirSync(hookDir, { recursive: true });
		writeFileSync(hook, PRE_COMMIT);
		log("wrote .githooks/pre-commit");
	} else {
		skip(".githooks/pre-commit");
	}
	chmodSync(hook, 0o755);
	// Point git at the committed hooks dir now (the prepare script repeats this
	// on future installs). Harmless if not a git repo.
	spawnSync("git", ["config", "core.hooksPath", ".githooks"], {
		cwd,
		stdio: "ignore",
	});
}

function ensureGuideImport(cwd) {
	const claudePath = resolve(cwd, "CLAUDE.md");
	if (!existsSync(claudePath)) {
		writeFileSync(claudePath, `# Project\n\n${GUIDE_IMPORT}\n`);
		log("wrote CLAUDE.md with the agent-guide import");
		return;
	}
	const body = readFileSync(claudePath, "utf8");
	if (body.includes("nk-dev/guide.md")) {
		log("CLAUDE.md already imports the agent guide.");
		return;
	}
	writeFileSync(claudePath, `${body.replace(/\n*$/, "")}\n\n${GUIDE_IMPORT}\n`);
	log("added the agent-guide import to CLAUDE.md");
}

function hintVitestConfig(cwd) {
	if (existsSync(resolve(cwd, "vitest.config.ts"))) {
		skip("vitest.config.ts");
		return;
	}
	log("no vitest.config.ts — if you test with Vitest, create one:");
	console.log(`      ${VITEST_HINT.replace(/\\n/g, "\n      ")}`);
}

function ensurePrepareScript(cwd) {
	const pkgPath = resolve(cwd, "package.json");
	const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
	pkg.scripts ??= {};
	const wanted = "git config core.hooksPath .githooks || true";
	if (pkg.scripts.prepare?.includes("core.hooksPath")) {
		log("package.json already has a hooks `prepare` script.");
		return;
	}
	pkg.scripts.prepare = pkg.scripts.prepare
		? `${pkg.scripts.prepare} && ${wanted}`
		: wanted;
	writeJson(pkgPath, pkg);
	log("added a `prepare` script to package.json (wires core.hooksPath).");
}
