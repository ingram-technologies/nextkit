import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

/**
 * Whether `@ingram-tech/nk-db` is resolvable from the site — the signal that
 * its `nk-pglite-dev` bin is available. Note this is package *resolvability*,
 * not a direct-dependency check: a transitively hoisted nk-db also flips PGlite
 * mode on (harmless — the bin still runs `next dev`; it just also boots a local
 * Postgres the site may not use).
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
 * If `@ingram-tech/nk-auth` is installed, the `nk-pglite-dev` flag that makes
 * the local database apply its shipped auth-table migration chain (see
 * docs/db-package.md § "The nk-auth migration chain"). Returned as
 * `--dep-migrations <folder>#<table>` args, or `[]` when nk-auth is absent.
 *
 * This resolution lives here, not in nk-db: `nk` is the orchestrator that
 * already knows both packages, so nk-db's harness stays generic and the
 * dependency graph stays acyclic (nk-auth → nk-db, never the reverse).
 */
function authMigrationArgs() {
	try {
		const require = createRequire(resolve(process.cwd(), "package.json"));
		// Resolve the shipped journal via nk-auth's `./migrations/*` export (its
		// `exports` deliberately does not expose `./package.json`). A successful
		// resolve both locates the folder AND confirms the chain is shipped; the
		// folder is the journal's grandparent (…/migrations/meta/_journal.json).
		const journal =
			require.resolve("@ingram-tech/nk-auth/migrations/meta/_journal.json");
		const folder = dirname(dirname(journal));
		return ["--dep-migrations", `${folder}#__nkauth_migrations`];
	} catch {
		return [];
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
		? ["nk-pglite-dev", ...authMigrationArgs(), ...extraArgs]
		: ["next", "dev", "--turbopack", ...extraArgs];
	if (command[0] === "nk-pglite-dev") {
		console.log("nk: @ingram-tech/nk-db found — booting local PGlite (no Docker)…");
	}
	// spawnSync inherits stdio and blocks until exit, so Ctrl-C reaches the child.
	const res = spawnSync("bun", ["x", ...command], { stdio: "inherit" });
	// Signal-killed (status null) is a failure, not a clean exit.
	process.exit(res.status ?? (res.signal ? 1 : 0));
}
