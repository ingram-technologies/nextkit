import { checkAgentGuideImport } from "./agent-guide.js";
import { formatSql } from "./format.js";
import { FORMATTER } from "./formatter.js";
import { run } from "./run.js";

/** `nk lint` — oxlint. */
export function lint() {
	process.exit(run(FORMATTER.lint[0], FORMATTER.lint[1]));
}

/** `nk check` — the CI gate: lint + format verify (code) plus SQL format verify. */
export async function check() {
	// Run every gate before deciding (no short-circuit), so one failure doesn't
	// hide another. oxc splits lint (oxlint) and format (oxfmt), so we run both.
	const lintFailed = run(FORMATTER.lint[0], FORMATTER.lint[1]) !== 0;
	const fmtFailed = run(FORMATTER.checkFormat[0], FORMATTER.checkFormat[1]) !== 0;
	await formatSql({ check: true });
	const sqlFailed = Boolean(process.exitCode);
	// Keep the site on the shared-guidance channel: if it depends on
	// @ingram-tech/agent-guide, its CLAUDE.md must @import the guide.
	const guide = checkAgentGuideImport();
	if (!guide.ok) {
		console.error(`nk check: ${guide.reason}`);
		console.error(
			"  → add `@./node_modules/@ingram-tech/agent-guide/guide.md` to your CLAUDE.md (see the agent-guide README).",
		);
	}
	process.exit(lintFailed || fmtFailed || sqlFailed || !guide.ok ? 1 : 0);
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
