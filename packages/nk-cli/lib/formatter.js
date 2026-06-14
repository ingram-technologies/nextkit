import { readNkConfig } from "./config.js";

/**
 * The code formatter/linter is swappable so a site can pick its toolchain
 * without nk touching every command. Each entry maps the operations nk needs
 * to a `[tool, args]` invocation; `null` means the tool doesn't support that
 * operation (callers skip it).
 *
 * oxc (oxlint + oxfmt) is the default. biome stays fully wired as a fallback
 * for sites not yet migrated — switch with `{ "nk": { "formatter": "biome" } }`.
 * Lint and format are kept as separate ops because oxc splits them across two
 * tools; `nk check` runs both (see passthrough.js).
 */
const FORMATTERS = {
	oxc: {
		name: "oxc",
		write: ["oxfmt", ["--write", "."]],
		checkFormat: ["oxfmt", ["--check", "."]],
		lint: ["oxlint", []],
	},
	biome: {
		name: "biome",
		write: ["biome", ["format", "--write", "."]],
		checkFormat: ["biome", ["format", "."]],
		lint: ["biome", ["lint", "."]],
	},
};

/** Resolve the configured formatter (default: oxc). Exits on an unknown name. */
export function resolveFormatter(cwd = process.cwd()) {
	const name = readNkConfig(cwd).formatter ?? "oxc";
	const formatter = FORMATTERS[name];
	if (!formatter) {
		console.error(
			`nk: unknown formatter "${name}" — expected one of: ${Object.keys(FORMATTERS).join(", ")}`,
		);
		process.exit(1);
	}
	return formatter;
}
