import { checkAgentGuideImport } from "./agent-guide.js";
import {
	cleanGeneratedArtifacts,
	onlyGeneratedTypeErrors,
	staleBuildInfo,
} from "./artifacts.js";
import { toolDrift } from "./drift.js";
import { FORMATTER } from "./formatter.js";
import { hasKnipConfig, runKnip } from "./knip.js";
import { checkSeal } from "./migrations.js";
import { run, runCapture, writeThrough } from "./run.js";
import {
	tailwindCoverageFindings,
	tailwindSourceFindings,
} from "./tailwind-sources.js";
import { readdirSync, rmSync } from "node:fs";

/** `nk lint [...]` — oxlint, with extra args passed through (e.g. `--fix`). */
export function lint(extraArgs = []) {
	process.exit(run(FORMATTER.lint[0], [...FORMATTER.lint[1], ...extraArgs]));
}

/**
 * `nk check` — the CI gate. Runs every fast checker and reports them all before
 * failing: oxlint, oxfmt (format), knip (when configured), and the agent-guide
 * import gate. Tooling drift (superseded deps) is reported as a non-fatal
 * warning — `nk doctor --fix` resolves it. Tailwind `@source` paths that
 * resolve to nothing, and workspace packages no stylesheet scans, fail the
 * gate: no other checker reads CSS.
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
	// Applied migrations are immutable. A no-op on sites without a `drizzle/`
	// journal, so it costs non-database sites nothing.
	const seal = checkSeal();
	if (!seal.ok) {
		console.error(`nk check: ${seal.reason}`);
		console.error(
			"  → restore the file and add a new migration, or run `nk migrations` to seal a newly generated one.",
		);
	}
	// A tailwind @source that matches nothing drops every class only those
	// files use, and no other gate reads CSS. A no-op on sites without one.
	const sources = tailwindSourceFindings();
	for (const { file, source, resolved } of sources) {
		console.error(
			`nk check: ${file} scans \`${source}\`, which does not exist (${resolved})`,
		);
		console.error(
			"  → tailwind resolves @source against the stylesheet and silently scans nothing; fix the path.",
		);
	}
	// The same failure from the other side: a workspace package whose classes
	// no stylesheet scans. Automatic detection never reaches a sibling package.
	const uncovered = tailwindCoverageFindings();
	for (const { name, dir } of uncovered) {
		console.error(
			`nk check: no @source scans \`${name}\` (${dir}), whose components write class names`,
		);
		console.error(
			"  → tailwind only scans the site; add `@source` for the package or its classes are dropped.",
		);
	}
	warnToolDrift();
	process.exit(
		lintFailed ||
			fmtFailed ||
			knipFailed ||
			!guide.ok ||
			!seal.ok ||
			sources.length > 0 ||
			uncovered.length > 0
			? 1
			: 0,
	);
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

/**
 * `nk type-check` — the house type-check: regenerate Next's types, then tsc.
 *
 * Recovers from damaged generated types. `tsconfig.json` feeds Next's
 * typed-routes output back into `tsc`, and a killed dev server can leave it
 * truncated mid-write; `next typegen` does not repair it, so the same syntax
 * error inside `.next/` survives every re-run and reads as a source defect.
 * When *every* reported error sits in generated output, the artifacts are
 * cleaned and the check retried once — see {@link cleanGeneratedArtifacts}.
 *
 * The retry matters beyond the confusing message: a syntax error in generated
 * output suppresses semantic diagnostics for the whole program, so real `src/`
 * errors are hidden behind it. Recovering surfaces them and still exits
 * non-zero — it never turns a failing check into a passing one.
 *
 * Starts cold when the dependency tree moved. `tsc --incremental` does not
 * reliably re-check a program when a dependency's `.d.ts` changes, so a
 * `.tsbuildinfo` older than the lockfile is a green light that means nothing;
 * it is dropped (with a note) before the run. `--cold` drops it
 * unconditionally.
 */
export function typeCheck(extraArgs = []) {
	const cold = extraArgs.includes("--cold");
	const stale = cold
		? cleanBuildInfoOnly()
		: staleBuildInfo().map((file) => {
				rmSync(file, { force: true });
				return file;
			});
	if (stale.length > 0) {
		console.error(
			`nk type-check: ${cold ? "--cold" : "dependencies changed since the last run"} — removed ${stale.join(", ")}; checking from scratch.`,
		);
	}

	const typegen = run("next", ["typegen"]);
	if (typegen !== 0) process.exit(typegen);

	const first = runCapture("tsc", ["--noEmit"]);
	if (first.status === 0 || !onlyGeneratedTypeErrors(first.output)) {
		// Either a pass, or errors the caller needs to read and fix themselves.
		writeThrough(first);
		process.exit(first.status);
	}

	const removed = cleanGeneratedArtifacts();
	console.error(
		`nk type-check: every error was inside generated types — removed ${removed.join(", ")} and retrying.`,
	);

	const regen = run("next", ["typegen"]);
	if (regen !== 0) process.exit(regen);
	// Retry with inherited stdio: this is the run whose output matters, and it
	// keeps colour when a human is watching.
	process.exit(run("tsc", ["--noEmit"]));
}

/** Delete every `*.tsbuildinfo` in cwd and return the names removed. */
function cleanBuildInfoOnly() {
	const removed = [];
	for (const name of readdirSync(process.cwd())) {
		if (!name.endsWith(".tsbuildinfo")) continue;
		rmSync(name, { force: true });
		removed.push(name);
	}
	return removed;
}

/**
 * `nk clean` — remove build artifacts that tools regenerate from source
 * (Next's generated types, TypeScript incremental caches). Safe by
 * construction: whatever owns an artifact rebuilds it on the next run.
 */
export function clean() {
	const removed = cleanGeneratedArtifacts();
	if (removed.length === 0) {
		console.log("nk clean: no generated artifacts found.");
		return;
	}
	console.log(`nk clean: removed ${removed.join(", ")}.`);
}

/** `nk test [...]` — vitest run, with extra args passed through. */
export function test(extraArgs = []) {
	process.exit(run("vitest", ["run", ...extraArgs]));
}

/** `nk build [...]` — next build, with extra args passed through. */
export function build(extraArgs = []) {
	process.exit(run("next", ["build", ...extraArgs]));
}
