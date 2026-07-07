import { checkAgentGuideImport } from "./agent-guide.js";
import { formatSql } from "./format.js";
import { FORMATTER } from "./formatter.js";
import { hasKnipConfig, runKnip } from "./knip.js";
import { run } from "./run.js";

/** `nk lint` — oxlint. */
export function lint() {
	process.exit(run(FORMATTER.lint[0], FORMATTER.lint[1]));
}

/**
 * `nk check` — the CI gate. Runs every fast checker and reports them all before
 * failing: oxlint, oxfmt (format), SQL format, knip (when configured), and the
 * agent-guide import gate.
 */
export async function check() {
	// Run every gate before deciding (no short-circuit), so one failure doesn't
	// hide another. oxc splits lint (oxlint) and format (oxfmt), so we run both.
	const lintFailed = run(FORMATTER.lint[0], FORMATTER.lint[1]) !== 0;
	const fmtFailed = run(FORMATTER.checkFormat[0], FORMATTER.checkFormat[1]) !== 0;
	const sqlFailed = await formatSql({ check: true });
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
	process.exit(
		lintFailed || fmtFailed || sqlFailed || knipFailed || !guide.ok ? 1 : 0,
	);
}

/** `nk type-check` — the house type-check: regenerate Next's types, then tsc. */
export function typeCheck() {
	const typegen = run("next", ["typegen"]);
	if (typegen !== 0) process.exit(typegen);
	process.exit(run("tsc", ["--noEmit"]));
}

/** `nk build [...]` — next build, with extra args passed through. */
export function build(extraArgs = []) {
	process.exit(run("next", ["build", ...extraArgs]));
}
