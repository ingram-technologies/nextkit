import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// A Claude Code `@import` of the shared guide, e.g.
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

// CLAUDE.md sits next to package.json for a standard site; for an app nested in a
// subdir (e.g. `web/`) it lives one level up at the repo root. Check both.
function findClaudeMd(cwd) {
	for (const dir of [cwd, dirname(resolve(cwd))]) {
		const p = resolve(dir, "CLAUDE.md");
		if (existsSync(p)) return p;
	}
	return null;
}

/**
 * nextkit's shared agent guidance (`@ingram-tech/nk-dev/guide.md`) only reaches
 * an AI agent if the site's CLAUDE.md `@import`s it. A site can depend on nk-dev
 * yet forget the import line — then the guidance silently never loads. When the
 * package is a dependency, assert CLAUDE.md actually imports it.
 *
 * Returns `{ ok, reason }`. `ok` is true when there's nothing to enforce (the
 * package isn't a dependency) or the import is present; `reason` explains a miss.
 */
export function checkAgentGuideImport(cwd = process.cwd()) {
	const deps = readDeps(cwd);
	if (!deps || !deps["@ingram-tech/nk-dev"]) return { ok: true };

	const claudePath = findClaudeMd(cwd);
	if (!claudePath) {
		return {
			ok: false,
			reason: "depends on @ingram-tech/nk-dev but has no CLAUDE.md importing its guide",
		};
	}
	if (!IMPORT_RE.test(readFileSync(claudePath, "utf8"))) {
		return {
			ok: false,
			reason: "CLAUDE.md does not @import @ingram-tech/nk-dev/guide.md (shared agent guidance won't load)",
		};
	}
	return { ok: true };
}
