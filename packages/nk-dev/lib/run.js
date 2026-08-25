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

/**
 * Like {@link run}, but captures the tool's output instead of inheriting stdio,
 * so a caller can inspect it before deciding what to print. Returns the exit
 * code plus the combined output; the caller is responsible for forwarding it.
 *
 * Colour is left to the tool: with stdio piped there is no TTY, so tools that
 * auto-detect print plain text — which is also what makes their output
 * parseable.
 */
export function runCapture(tool, args = [], opts = {}) {
	const res = spawnSync("bun", ["x", tool, ...args], {
		encoding: "utf8",
		// Node's default is 1 MiB, after which the child is killed with ENOBUFS
		// and the caller sees a crash instead of the tool's output. A tsc run
		// with a few thousand errors is well past that — exactly the run whose
		// output matters most. 256 MiB is far beyond any real checker output.
		maxBuffer: 256 * 1024 * 1024,
		...opts,
	});
	if (res.error) {
		if (res.error.code === "ENOENT") {
			fail("could not run `bun` — is bun installed and on PATH?");
		}
		throw res.error;
	}
	return {
		status: res.status ?? (res.signal ? 1 : 0),
		stdout: res.stdout ?? "",
		stderr: res.stderr ?? "",
		output: `${res.stdout ?? ""}${res.stderr ?? ""}`,
	};
}

/** Forward a {@link runCapture} result to this process's stdio, unchanged. */
export function writeThrough({ stdout, stderr }) {
	if (stdout) process.stdout.write(stdout);
	if (stderr) process.stderr.write(stderr);
}

/** Print an `nk:`-prefixed error and exit non-zero. */
export function fail(message) {
	console.error(`nk: ${message}`);
	process.exit(1);
}
