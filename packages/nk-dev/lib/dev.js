import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";

/**
 * Whether the site has `@ingram-tech/nk-db` installed — i.e. its `nk-pglite-dev`
 * bin is available. Resolved from the site's own `node_modules`, so `nk` only
 * orchestrates a tool the site already provides (the carve-out).
 */
function hasPgliteDev() {
	try {
		const require = createRequire(resolve(process.cwd(), "package.json"));
		require.resolve("@ingram-tech/nk-db");
		return true;
	} catch {
		return false;
	}
}

/**
 * `nk dev` — start the Next dev server on the golden-path local database.
 *
 * If `@ingram-tech/nk-db` is installed, hand off to its `nk-pglite-dev` bin: it
 * boots PGlite (Postgres-in-WASM, no Docker), applies the `drizzle/` migrations,
 * sets `DATABASE_URL`, and runs `next dev` itself. Otherwise just `next dev`
 * (static/marketing sites with no database). PGlite logic lives in nk-db, not
 * here — `nk` only orchestrates.
 *
 * `nk dev` boots no external database service — when nk-db is installed it runs
 * local PGlite (Postgres-in-WASM), and a site with no database just runs Next.
 */
export function dev(extraArgs = []) {
	const command = hasPgliteDev()
		? ["nk-pglite-dev", ...extraArgs]
		: ["next", "dev", "--turbopack", ...extraArgs];
	if (command[0] === "nk-pglite-dev") {
		console.log("nk: @ingram-tech/nk-db found — booting local PGlite (no Docker)…");
	}
	// spawnSync inherits stdio and blocks until exit, so Ctrl-C reaches the child.
	const res = spawnSync("bunx", command, { stdio: "inherit" });
	process.exit(res.status ?? 0);
}
