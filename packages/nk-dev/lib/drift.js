import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Packages whose job `@ingram-tech/nk-dev` now owns — either because it bundles
 * the tool (oxfmt, oxlint) or because it superseded a standalone shared-config /
 * CLI / hooks package. A site on the nk-dev toolchain shouldn't re-declare any
 * of these: doing so either splits a tool's version across two pins (the exact
 * drift nk-dev centralizes away) or keeps a dead dependency on a retired package.
 */
export const SUPERSEDED_DEPS = [
	"oxfmt",
	"oxlint",
	"prettier",
	"prettier-plugin-sql",
	"@ingram-tech/oxlint-config",
	"@ingram-tech/typescript-config",
	"@ingram-tech/nk-cli",
	"@ingram-tech/git-hooks",
];

/**
 * The superseded packages this repo still declares. Empty when the repo is
 * clean, or when it doesn't depend on nk-dev at all (nothing to enforce).
 */
export function toolDrift(cwd = process.cwd()) {
	let pkg;
	try {
		pkg = JSON.parse(readFileSync(resolve(cwd, "package.json"), "utf8"));
	} catch {
		return [];
	}
	const deps = { ...pkg.dependencies, ...pkg.devDependencies };
	if (!deps["@ingram-tech/nk-dev"]) return [];
	return SUPERSEDED_DEPS.filter((d) => d in deps);
}
