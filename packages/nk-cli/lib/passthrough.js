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
	let failed = run(formatter.check[0], formatter.check[1]) !== 0;
	await formatSql({ check: true });
	if (process.exitCode) failed = true;
	process.exit(failed ? 1 : 0);
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
