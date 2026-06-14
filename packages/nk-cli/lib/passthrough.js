import { formatSql } from "./format.js";
import { resolveFormatter } from "./formatter.js";
import { run } from "./run.js";

/** `nk lint` — lint with the configured formatter. */
export function lint() {
	const formatter = resolveFormatter();
	process.exit(run(formatter.lint[0], formatter.lint[1]));
}

/** `nk check` — the CI gate: lint + format verify (code) plus SQL format verify. */
export async function check() {
	const formatter = resolveFormatter();
	// Run every gate before deciding (no short-circuit), so one failure doesn't
	// hide another. oxc splits lint (oxlint) and format (oxfmt); biome could do
	// both in one pass, but running them separately keeps one code path.
	const lintFailed = run(formatter.lint[0], formatter.lint[1]) !== 0;
	const fmtFailed = formatter.checkFormat
		? run(formatter.checkFormat[0], formatter.checkFormat[1]) !== 0
		: false;
	await formatSql({ check: true });
	const sqlFailed = Boolean(process.exitCode);
	process.exit(lintFailed || fmtFailed || sqlFailed ? 1 : 0);
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
