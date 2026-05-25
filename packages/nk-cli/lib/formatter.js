import { readNkConfig } from "./config.js";

/**
 * The code formatter/linter is swappable so we can move off Biome later (e.g.
 * to oxc) without touching every command or every site. Each entry maps the
 * operations nk needs to a `[tool, args]` invocation; `null` means the tool
 * doesn't (yet) support that operation.
 *
 * Biome is the default and only fully-wired option today. oxc is sketched so
 * the switch is a one-word config change once its formatter (oxfmt) is GA.
 */
const FORMATTERS = {
	biome: {
		name: "biome",
		write: ["biome", ["format", "--write", "."]],
		checkFormat: ["biome", ["format", "."]],
		lint: ["biome", ["lint", "."]],
		check: ["biome", ["check", "."]],
	},
	oxc: {
		name: "oxc",
		// oxc's formatter (oxfmt) isn't GA yet — nk skips code formatting and
		// warns when it is, still formatting SQL via Prettier.
		write: null,
		checkFormat: null,
		lint: ["oxlint", []],
		check: ["oxlint", []],
	},
};

/** Resolve the configured formatter (default: biome). Exits on an unknown name. */
export function resolveFormatter(cwd = process.cwd()) {
	const name = readNkConfig(cwd).formatter ?? "biome";
	const formatter = FORMATTERS[name];
	if (!formatter) {
		console.error(
			`nk: unknown formatter "${name}" — expected one of: ${Object.keys(FORMATTERS).join(", ")}`,
		);
		process.exit(1);
	}
	return formatter;
}
