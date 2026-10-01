import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

/** The line that `@import`s the shared guide into a CLAUDE.md. */
export const GUIDE_IMPORT = "@./node_modules/@ingram-tech/nk-dev/guide.md";

// Any spelling of the import, e.g.
//   @./node_modules/@ingram-tech/nk-dev/guide.md
//   @./web/node_modules/@ingram-tech/nk-dev/guide.md  (app in a subdir)
const IMPORT_RE = /@\S*nk-dev\/guide\.md/;

function readDeps(cwd) {
	try {
		const pkg = JSON.parse(readFileSync(resolve(cwd, "package.json"), "utf8"));
		return { ...pkg.dependencies, ...pkg.devDependencies };
	} catch {
		return null; // no/unreadable package.json — nothing to enforce
	}
}

/**
 * Every CLAUDE.md from `cwd` up to the repository root, nearest first. Claude
 * Code loads all of them, so an import in any one reaches the agent. The walk
 * stops at the directory holding `.git`: a CLAUDE.md above the repository is
 * absent in CI, and must not pass the gate on one machine only.
 */
function claudeFiles(cwd) {
	const files = [];
	let dir = resolve(cwd);
	for (;;) {
		const file = resolve(dir, "CLAUDE.md");
		if (existsSync(file)) files.push(file);
		const parent = dirname(dir);
		if (existsSync(resolve(dir, ".git")) || parent === dir) return files;
		dir = parent;
	}
}

/** The CLAUDE.md that imports the guide, from `cwd` up to the repository root. */
function findGuideImport(cwd) {
	const files = claudeFiles(cwd);
	return {
		files,
		importer: files.find((file) => IMPORT_RE.test(readFileSync(file, "utf8"))),
	};
}

/**
 * nextkit's shared agent guidance (`@ingram-tech/nk-dev/guide.md`) only reaches
 * an AI agent if a CLAUDE.md it loads `@import`s it. A site can depend on nk-dev
 * yet forget the import line — then the guidance silently never loads. When the
 * package is a dependency, assert that a CLAUDE.md from here to the repository
 * root imports it.
 *
 * Returns `{ ok, reason }`. `ok` is true when there's nothing to enforce (the
 * package isn't a dependency) or the import is present; `reason` explains a miss.
 */
export function checkAgentGuideImport(cwd = process.cwd()) {
	const deps = readDeps(cwd);
	if (!deps || !deps["@ingram-tech/nk-dev"]) return { ok: true };

	const { files, importer } = findGuideImport(cwd);
	if (importer) return { ok: true };
	if (files.length === 0) {
		return {
			ok: false,
			reason: "depends on @ingram-tech/nk-dev but has no CLAUDE.md importing its guide",
		};
	}
	return {
		ok: false,
		reason: "CLAUDE.md does not @import @ingram-tech/nk-dev/guide.md, and no CLAUDE.md above it up to the repository root does (shared agent guidance won't load)",
	};
}

/**
 * Make the guide reach the agent working in `dir`: when no CLAUDE.md from `dir`
 * to the repository root imports it, add the import to `dir/CLAUDE.md`,
 * creating the file if needed. Idempotent. Returns a short past-tense note.
 */
export function ensureGuideImport(dir) {
	const { importer } = findGuideImport(dir);
	if (importer) {
		return `${relative(dir, importer) || "CLAUDE.md"} already imports the agent guide`;
	}
	const file = resolve(dir, "CLAUDE.md");
	if (!existsSync(file)) {
		writeFileSync(file, `# Project\n\n${GUIDE_IMPORT}\n`);
		return "wrote CLAUDE.md with the agent-guide import";
	}
	const body = readFileSync(file, "utf8");
	writeFileSync(file, `${body.replace(/\n*$/, "")}\n\n${GUIDE_IMPORT}\n`);
	return "added the agent-guide import to CLAUDE.md";
}
