#!/usr/bin/env node
/**
 * nextkit pre-commit: format staged files with Biome, then re-stage them.
 *
 * Centralizes the logic that lived inline in each repo's `.githooks/pre-commit`.
 * Sites get it by pointing their committed `.githooks/pre-commit` at this bin —
 * so the behavior updates in one place when this package is bumped.
 *
 * Behavior:
 *   - Only staged files are touched (never the whole tree).
 *   - Only extensions Biome understands are passed to it.
 *   - Files are re-staged after formatting so the commit includes the result.
 *   - Formatting only — no lint gate on commit (lint runs in CI).
 */
import { execFileSync } from "node:child_process";

const FORMATTABLE = /\.(jsx?|tsx?|mts|cts|json|jsonc|css|graphql|gql)$/;

const git = (args) =>
	execFileSync("git", args, { encoding: "utf8" }).trim();

const stagedFiles = git([
	"diff",
	"--cached",
	"--name-only",
	"--diff-filter=ACMRTUXB",
])
	.split("\n")
	.filter(Boolean);

if (stagedFiles.length === 0) process.exit(0);

const toFormat = stagedFiles.filter((f) => FORMATTABLE.test(f));
if (toFormat.length === 0) process.exit(0);

try {
	execFileSync(
		"bunx",
		[
			"biome",
			"format",
			"--write",
			"--files-ignore-unknown=true",
			"--no-errors-on-unmatched",
			"--",
			...toFormat,
		],
		{ stdio: "inherit" },
	);
} catch (err) {
	console.error("[nextkit] biome format failed:", err.message);
	process.exit(1);
}

// Re-stage only the files that were already staged and still exist.
const existing = toFormat.filter((f) => {
	try {
		execFileSync("test", ["-e", f]);
		return true;
	} catch {
		return false;
	}
});
if (existing.length > 0) git(["add", "--", ...existing]);
