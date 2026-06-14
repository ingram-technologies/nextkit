import { defineConfig } from "vitest/config";

// Env/config + query-helper logic; no DOM. The PGlite harness tests (if added)
// must run serially — pglite-socket is single-connection — so keep
// fileParallelism off for this package.
export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
		fileParallelism: false,
	},
});
