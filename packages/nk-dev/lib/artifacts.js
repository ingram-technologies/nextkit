import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * Directories a tool regenerates from source, and which `tsconfig.json`
 * typically feeds back into `tsc` (Next's typed-routes output is in `include`).
 *
 * That round trip is what makes them worth tracking: a killed `next dev` can
 * leave `.next/dev/types/validator.ts` truncated mid-write, and `next typegen`
 * does **not** repair it, so `tsc` keeps reporting a syntax error inside
 * generated code until the directory is removed. The error points at `.next/`,
 * so the natural reflex is to hunt a type error in `src/` that doesn't exist.
 */
const GENERATED_DIRECTORIES = [
	{ path: ".next/dev/types", owner: "next typegen", typeCheckInput: true },
	{ path: ".next/types", owner: "next typegen", typeCheckInput: true },
];

/** Prefixes (posix-normalised) that `tsc` error locations may fall inside. */
const TYPE_CHECK_INPUT_PREFIXES = GENERATED_DIRECTORIES.filter(
	(entry) => entry.typeCheckInput,
).map((entry) => entry.path);

/**
 * Every generated artifact present in `cwd`. Incremental-build caches are
 * discovered rather than hardcoded, since `tsBuildInfoFile` renames them and a
 * repo can carry several (`tsconfig.tsbuildinfo`, `tsconfig.slice.tsbuildinfo`).
 *
 * Deleting any of these is safe by construction: the owning tool rebuilds it.
 */
export function listGeneratedArtifacts(cwd = process.cwd()) {
	const present = GENERATED_DIRECTORIES.filter((entry) =>
		existsSync(join(cwd, entry.path)),
	);

	let buildInfo = [];
	try {
		buildInfo = readdirSync(cwd)
			.filter((name) => name.endsWith(".tsbuildinfo"))
			.map((name) => ({ path: name, owner: "tsc", typeCheckInput: false }));
	} catch {
		// An unreadable cwd is the caller's problem, not this helper's.
	}

	return [...present, ...buildInfo];
}

/**
 * Remove generated artifacts and return the paths actually deleted. Missing
 * paths are skipped rather than reported, so this is idempotent.
 */
export function cleanGeneratedArtifacts(cwd = process.cwd()) {
	const removed = [];
	for (const entry of listGeneratedArtifacts(cwd)) {
		rmSync(join(cwd, entry.path), { recursive: true, force: true });
		removed.push(entry.path);
	}
	return removed;
}

// Colour codes only (ESC [ … m). ESC is built from its code point rather
// than written inline: matching it is the entire point of stripping colour, but
// a control character inside a regex literal trips `no-control-regex`.
const ANSI = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, "g");

/**
 * `tsc` error headers, in both layouts: plain (piped / `--pretty false`) and
 * pretty (a TTY, or `--pretty`).
 */
const ERROR_LOCATIONS = [
	/^(.+?)\((\d+),(\d+)\): (?:error|warning) TS\d+/,
	/^(.+?):(\d+):(\d+) - (?:error|warning) TS\d+/,
];

/** Unique file paths `tsc` reported errors in, posix-normalised. */
export function errorFiles(output) {
	const files = new Set();
	for (const rawLine of String(output).split(/\r?\n/)) {
		const line = rawLine.replace(ANSI, "");
		for (const pattern of ERROR_LOCATIONS) {
			const match = line.match(pattern);
			if (!match?.[1]) continue;
			files.add(match[1].trim().replaceAll("\\", "/").replace(/^\.\//, ""));
			break;
		}
	}
	return [...files];
}

/**
 * Whether every error `tsc` reported sits inside generated type output — the
 * signature of a damaged artifact rather than a source defect.
 *
 * Deliberately "every", not "any": a run that mixes generated and `src/` errors
 * has real work in it, and cleaning would neither fix nor excuse those.
 */
export function onlyGeneratedTypeErrors(output) {
	const files = errorFiles(output);
	if (files.length === 0) return false;
	return files.every((file) =>
		TYPE_CHECK_INPUT_PREFIXES.some(
			(prefix) => file === prefix || file.startsWith(`${prefix}/`),
		),
	);
}
