import { checkAgentGuideImport } from "./agent-guide.js";
import { toolDrift } from "./drift.js";
import { FORMATTER } from "./formatter.js";
import { hasKnipConfig, runKnip } from "./knip.js";
import { run } from "./run.js";

/** `nk lint` — oxlint. */
export function lint() {
	process.exit(run(FORMATTER.lint[0], FORMATTER.lint[1]));
}

/**
 * `nk check` — the CI gate. Runs every fast checker and reports them all before
 * failing: oxlint, oxfmt (format), knip (when configured), and the agent-guide
 * import gate. Tooling drift (superseded deps) is reported as a non-fatal
 * warning — `nk doctor --fix` resolves it.
 */
export function check() {
	// Run every gate before deciding (no short-circuit), so one failure doesn't
	// hide another. oxc splits lint (oxlint) and format (oxfmt), so we run both.
	const lintFailed = run(FORMATTER.lint[0], FORMATTER.lint[1]) !== 0;
	const fmtFailed = run(FORMATTER.checkFormat[0], FORMATTER.checkFormat[1]) !== 0;
	// knip (unused deps/exports/files). Opt-in: only when the repo has a knip
	// config — knip has no shareable config, so absence means "not adopted".
	const knipFailed = hasKnipConfig() ? runKnip() !== 0 : false;
	// Keep the site on the shared-guidance channel: if it depends on
	// @ingram-tech/nk-dev, its CLAUDE.md must @import the guide.
	const guide = checkAgentGuideImport();
	if (!guide.ok) {
		console.error(`nk check: ${guide.reason}`);
		console.error(
			"  → add `@./node_modules/@ingram-tech/nk-dev/guide.md` to your CLAUDE.md (or run `nk init`).",
		);
	}
	warnToolDrift();
	process.exit(lintFailed || fmtFailed || knipFailed || !guide.ok ? 1 : 0);
}

/** Non-fatal: surface superseded deps so drift doesn't silently re-accumulate. */
function warnToolDrift() {
	const drift = toolDrift();
	if (drift.length === 0) return;
	console.error(
		`nk check: ${drift.length} dependency(ies) superseded by @ingram-tech/nk-dev — ${drift.join(", ")}`,
	);
	console.error(
		"  → nk-dev already provides these; run `nk doctor --fix` to remove them.",
	);
}

/** `nk type-check` — the house type-check: regenerate Next's types, then tsc. */
export function typeCheck() {
	const typegen = run("next", ["typegen"]);
	if (typegen !== 0) process.exit(typegen);
	process.exit(run("tsc", ["--noEmit"]));
}

/** `nk test [...]` — vitest run, with extra args passed through. */
export function test(extraArgs = []) {
	process.exit(run("vitest", ["run", ...extraArgs]));
}

/** `nk build [...]` — next build, with extra args passed through. */
export function build(extraArgs = []) {
	process.exit(run("next", ["build", ...extraArgs]));
}
