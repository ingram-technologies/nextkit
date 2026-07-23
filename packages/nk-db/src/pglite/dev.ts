#!/usr/bin/env node
// The `nk-pglite-dev` bin: what `nk dev` shells out to when this package is
// installed. Boots PGlite (persisted to .pglite/), applies the `drizzle/`
// migrations, then runs `next dev` against it. `--fresh` wipes and rebuilds.
//
//   nk-pglite-dev                            apply drizzle/ + run next dev
//   nk-pglite-dev --fresh                    wipe .pglite/ first
//   nk-pglite-dev --dep-migrations <f>#<t>   also apply chain <f> under journal
//                                            table <t>, BEFORE drizzle/ (repeatable)
//
// `--dep-migrations` lets an orchestrator inject extra migration chains without
// this bin knowing whose they are — `nk dev` uses it to apply nk-auth's shipped
// auth tables. Everything else is forwarded to `next dev`.
//
// Run directly by Node, so the relative import carries a `.js` extension.
import type { PgliteServerOptions } from "./index.js";
import { startPgliteDev } from "./index.js";

const argv = process.argv.slice(2);

// Pull `--dep-migrations <folder>#<table>` pairs out of the args; everything
// left over (minus --fresh) is forwarded verbatim to `next dev`. `#` separates
// folder from table because it never appears in a node_modules path.
const dependencyMigrations: NonNullable<PgliteServerOptions["dependencyMigrations"]> =
	[];
const nextArgs: string[] = [];
let fresh = false;

for (let i = 0; i < argv.length; i++) {
	const arg = argv[i];
	if (arg === undefined) continue;
	if (arg === "--fresh") {
		fresh = true;
		continue;
	}
	if (arg === "--dep-migrations") {
		const spec = argv[++i];
		if (spec === undefined) {
			console.error(
				"nk(pglite): --dep-migrations requires a <folder>#<table> value",
			);
			process.exit(1);
		}
		const hash = spec.lastIndexOf("#");
		if (hash <= 0 || hash === spec.length - 1) {
			console.error(
				`nk(pglite): --dep-migrations expects <folder>#<table>, got "${spec}"`,
			);
			process.exit(1);
		}
		dependencyMigrations.push({
			folder: spec.slice(0, hash),
			table: spec.slice(hash + 1),
		});
		continue;
	}
	nextArgs.push(arg);
}

startPgliteDev({ fresh, nextArgs, dependencyMigrations }).catch((error: unknown) => {
	console.error("nk(pglite): failed to start —", error);
	process.exit(1);
});
