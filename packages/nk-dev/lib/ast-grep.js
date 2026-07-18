import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fail } from "./run.js";

const require = createRequire(import.meta.url);

/**
 * Resolve the ast-grep native binary that nk-dev pins (`@ast-grep/cli`).
 *
 * We can't just `bun x ast-grep`: ast-grep is a *transitive* dep here (under
 * nk-dev), so its bin is never linked into the site's top-level node_modules/.bin
 * — `bun x ast-grep` falls through to a global on PATH (or re-downloads). And the
 * nested `.bin/ast-grep` that does exist points at `@ast-grep/cli`'s tiny JS
 * launcher, not the native binary: the launcher's postinstall normally swaps
 * itself for the binary, but Bun blocks postinstall for untrusted deps, so it
 * stays JS and warns on every run. The launcher's own `resolveBinaryPath()`
 * returns the exact platform binary regardless — the one entry point that's
 * correct across both states and both OSes.
 */
function astGrepBinary() {
	const { resolveBinaryPath } = require("@ast-grep/cli/postinstall.js");
	const bin = resolveBinaryPath();
	if (!bin) {
		fail(
			"located @ast-grep/cli but not its native binary — reinstall deps without `--no-optional`.",
		);
	}
	return bin;
}

/**
 * `nk ast-grep [...]` — run the ast-grep binary vendored by nk-dev (structural
 * search & rewrite of TS/TSX by AST pattern). A thin passthrough: every arg goes
 * to ast-grep, so its own `--help`, `run`, and `scan` subcommands work unchanged.
 * See the codemod skill at `skills/ts-codemod.md` for the workflow.
 */
export function astGrep(extraArgs = []) {
	let bin;
	try {
		bin = astGrepBinary();
	} catch (err) {
		fail(
			`could not resolve @ingram-tech/nk-dev's ast-grep (${err.message}) — reinstall your deps.`,
		);
	}
	const res = spawnSync(bin, extraArgs, { stdio: "inherit" });
	if (res.error) {
		if (res.error.code === "ENOENT") fail(`ast-grep binary missing at ${bin}`);
		throw res.error;
	}
	// A signal-killed child has status null — treat it as failure, not a pass.
	process.exit(res.status ?? (res.signal ? 1 : 0));
}
