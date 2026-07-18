#!/usr/bin/env node
/**
 * nextkit pre-commit: format staged files with oxfmt, then re-stage them.
 *
 * Centralizes the logic that lived inline in each repo's `.githooks/pre-commit`.
 * Sites get it by pointing their committed `.githooks/pre-commit` at this bin —
 * so the behavior updates in one place when this package is bumped.
 *
 * Behavior:
 *   - Only staged files are touched (never the whole tree).
 *   - Partially staged files (staged + unstaged hunks in the same file) are
 *     SKIPPED: `oxfmt --write` rewrites the working tree and the re-`git add`
 *     would silently sweep the unstaged hunks into the commit.
 *   - Only extensions oxfmt understands are passed to it.
 *   - oxfmt auto-discovers the repo's `.oxfmtrc.json` for house style.
 *   - Files are re-staged after formatting so the commit includes the result.
 *   - Formatting only — no lint gate on commit (lint runs in CI).
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const FORMATTABLE = /\.(jsx?|mjs|cjs|tsx?|mts|cts|json|jsonc|css|graphql|gql)$/;

const git = (args) => execFileSync("git", args, { encoding: "utf8" });

// -z: NUL-separated, unquoted names. The default output octal-escapes any
// non-ASCII filename ("\303\251 test.ts"), which then matches no real path and
// silently never gets formatted or re-staged.
const gitPathList = (args) =>
	git([...args, "-z"])
		.split("\0")
		.filter(Boolean);

const stagedFiles = gitPathList([
	"diff",
	"--cached",
	"--name-only",
	"--diff-filter=ACMRTUXB",
]);

if (stagedFiles.length === 0) process.exit(0);

// Files that also carry unstaged edits: formatting + re-adding them would
// commit hunks the developer deliberately left out (git add -p).
const partiallyStaged = new Set(gitPathList(["diff", "--name-only"]));

const formattable = stagedFiles.filter((f) => FORMATTABLE.test(f));
const toFormat = formattable.filter((f) => !partiallyStaged.has(f));
const skipped = formattable.filter((f) => partiallyStaged.has(f));
if (skipped.length > 0) {
	console.warn(
		`[nextkit] not formatting partially staged file(s) (unstaged hunks would be committed): ${skipped.join(", ")}`,
	);
}
if (toFormat.length === 0) process.exit(0);

try {
	execFileSync(
		"bun",
		["x", "oxfmt", "--write", "--no-error-on-unmatched-pattern", "--", ...toFormat],
		{ stdio: "inherit" },
	);
} catch (err) {
	console.error("[nextkit] oxfmt failed:", err.message);
	process.exit(1);
}

// Re-stage only the files that were already staged and still exist.
const existing = toFormat.filter((f) => existsSync(f));
if (existing.length > 0) git(["add", "--", ...existing]);
