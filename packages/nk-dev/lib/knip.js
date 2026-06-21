import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { run } from "./run.js";

// Knip has no shareable/extends config, so each repo carries its own. We treat
// the *presence* of a knip config as opt-in: `nk check` only runs knip when one
// of these exists, so sites that haven't adopted knip aren't suddenly gated.
const CONFIG_FILES = [
	"knip.json",
	"knip.jsonc",
	"knip.config.js",
	"knip.config.ts",
	"knip.ts",
	"knip.js",
];

/** Whether the project has a knip config (a file, or a package.json#knip key). */
export function hasKnipConfig(cwd = process.cwd()) {
	if (CONFIG_FILES.some((f) => existsSync(resolve(cwd, f)))) return true;
	try {
		const pkg = JSON.parse(readFileSync(resolve(cwd, "package.json"), "utf8"));
		return Boolean(pkg.knip);
	} catch {
		return false;
	}
}

/** Run knip (dependency/export/file hygiene). Returns its exit code. */
export function runKnip(extraArgs = []) {
	return run("knip", extraArgs);
}

/** `nk knip` — run knip directly. */
export function knip(extraArgs = []) {
	process.exit(runKnip(extraArgs));
}
