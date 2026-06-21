/**
 * The code formatter/linter is oxc (oxlint + oxfmt). Each entry maps an
 * operation nk needs to a `[tool, args]` invocation. Lint and format are kept
 * as separate ops because oxc splits them across two tools; `nk check` runs
 * both (see passthrough.js).
 */
export const FORMATTER = {
	name: "oxc",
	write: ["oxfmt", ["--write", "."]],
	checkFormat: ["oxfmt", ["--check", "."]],
	lint: ["oxlint", []],
};
