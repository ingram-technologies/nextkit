import { spawnSync } from "node:child_process";

/**
 * Run a site-local tool through `bunx` (resolves node_modules/.bin first) with
 * inherited stdio. Returns the exit code; never throws on a non-zero exit.
 */
export function run(tool, args = [], opts = {}) {
	const res = spawnSync("bunx", [tool, ...args], { stdio: "inherit", ...opts });
	if (res.error) {
		if (res.error.code === "ENOENT") {
			fail("could not run `bunx` — is bun installed and on PATH?");
		}
		throw res.error;
	}
	// A signal-killed child (OOM, SIGSEGV) has status null — that's a failure,
	// not a pass; `?? 0` would let a crashed linter through the CI gate.
	return res.status ?? (res.signal ? 1 : 0);
}

/** Print an `nk:`-prefixed error and exit non-zero. */
export function fail(message) {
	console.error(`nk: ${message}`);
	process.exit(1);
}
