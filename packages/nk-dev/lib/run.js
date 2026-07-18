import { spawnSync } from "node:child_process";

/**
 * Run a site-local tool through `bun x` (resolves node_modules/.bin first) with
 * inherited stdio. Returns the exit code; never throws on a non-zero exit.
 *
 * We spawn `bun x` rather than the `bunx` shim: on some installs (notably
 * Windows and Git's bundled sh) only `bun` lands on PATH, and `bunx` is an
 * alias for `bun x`, so this form works in a strict superset of environments.
 */
export function run(tool, args = [], opts = {}) {
	const res = spawnSync("bun", ["x", tool, ...args], { stdio: "inherit", ...opts });
	if (res.error) {
		if (res.error.code === "ENOENT") {
			fail("could not run `bun` — is bun installed and on PATH?");
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
