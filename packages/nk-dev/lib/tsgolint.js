import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * The native binary behind oxlint's type-aware rules, or null when this
 * platform has none. oxlint looks for it only in `node_modules/.bin` above the
 * linted directory and on PATH, and a dependency of nk-dev reaches neither
 * (bun's isolated installs link only a project's direct dependencies). So nk
 * resolves it from here, through the platform package oxlint-tsgolint's own
 * wrapper would spawn — the binary, not the wrapper, which needs `node`.
 */
export function tsgolintPath() {
	const binary = process.platform === "win32" ? "tsgolint.exe" : "tsgolint";
	try {
		const wrapper = createRequire(require.resolve("oxlint-tsgolint/package.json"));
		return wrapper.resolve(
			`@oxlint-tsgolint/${process.platform}-${process.arch}/${binary}`,
		);
	} catch (error) {
		if (error.code === "MODULE_NOT_FOUND") return null;
		throw error;
	}
}

/**
 * The environment for an oxlint run: `env` with `OXLINT_TSGOLINT_PATH` set to
 * the resolved backend. A path the caller set wins. oxlint reads the variable
 * only when the project's config turns on type-aware linting.
 */
export function lintEnvironment(env = process.env) {
	if (env.OXLINT_TSGOLINT_PATH) return env;
	const path = tsgolintPath();
	return path === null ? env : { ...env, OXLINT_TSGOLINT_PATH: path };
}
