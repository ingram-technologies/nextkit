import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Read the optional `"nk"` block from the consuming site's package.json, e.g.
 * `{ "nk": { "formatter": "oxc" } }`. Returns `{}` when absent or unreadable.
 */
export function readNkConfig(cwd = process.cwd()) {
	try {
		const pkg = JSON.parse(readFileSync(resolve(cwd, "package.json"), "utf8"));
		return pkg.nk ?? {};
	} catch {
		return {};
	}
}
