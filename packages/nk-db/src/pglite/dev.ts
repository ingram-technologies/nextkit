#!/usr/bin/env node
// The `nk-pglite-dev` bin: what `nk dev` shells out to when this package is
// installed. Boots PGlite (persisted to .pglite/), applies the `drizzle/`
// migrations, then runs `next dev` against it. `--fresh` wipes and rebuilds.
//
// Run directly by Node, so the relative import carries a `.js` extension.
import { startPgliteDev } from "./index.js";

const fresh = process.argv.includes("--fresh");
const nextArgs = process.argv.slice(2).filter((arg) => arg !== "--fresh");

startPgliteDev({ fresh, nextArgs }).catch((error: unknown) => {
	console.error("nk(pglite): failed to start —", error);
	process.exit(1);
});
