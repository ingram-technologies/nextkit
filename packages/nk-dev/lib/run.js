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
	return res.status ?? 0;
}

/**
 * Run a tool capturing its stdout (stderr still streams to the terminal).
 * Exits the process if the tool fails — callers depend on the captured output.
 */
export function capture(tool, args = [], opts = {}) {
	const res = spawnSync("bunx", [tool, ...args], {
		encoding: "utf8",
		stdio: ["inherit", "pipe", "inherit"],
		...opts,
	});
	if (res.error) {
		if (res.error.code === "ENOENT") {
			fail("could not run `bunx` — is bun installed and on PATH?");
		}
		throw res.error;
	}
	if (res.status !== 0) {
		fail(`\`${tool} ${args.join(" ")}\` exited with ${res.status}`);
	}
	return res.stdout ?? "";
}

/** Print an `nk:`-prefixed error and exit non-zero. */
export function fail(message) {
	console.error(`nk: ${message}`);
	process.exit(1);
}
