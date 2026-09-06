// Shared gate for the Base UI (@base-ui/react) rules: they only activate for
// projects that actually depend on the library, so the shared nextkit ruleset
// can enable them fleet-wide without firing on Radix or UI-less sites.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const baseUiCache = new Map();

const pkgDeclaresBaseUi = (pkgPath) => {
	try {
		const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
		return Boolean(
			pkg.dependencies?.["@base-ui/react"] ||
			pkg.devDependencies?.["@base-ui/react"] ||
			pkg.peerDependencies?.["@base-ui/react"],
		);
	} catch {
		return false;
	}
};

// Walk up to the nearest package.json and report whether it declares
// @base-ui/react, memoizing every directory visited so a lint run pays the fs
// cost once per project subtree.
export const projectUsesBaseUi = (fromDir) => {
	const seen = [];
	let dir = fromDir;
	let result = null;
	while (result === null) {
		if (baseUiCache.has(dir)) {
			result = baseUiCache.get(dir);
		} else {
			seen.push(dir);
			const pkgPath = join(dir, "package.json");
			const parent = dirname(dir);
			if (existsSync(pkgPath)) result = pkgDeclaresBaseUi(pkgPath);
			else if (parent === dir) result = false;
			else dir = parent;
		}
	}
	for (const d of seen) baseUiCache.set(d, result);
	return result;
};

/** Whether the rule should run for this file's project. */
export const fileUsesBaseUi = (context) => {
	const filename = context.physicalFilename || context.filename || "";
	return Boolean(filename) && projectUsesBaseUi(dirname(filename));
};
