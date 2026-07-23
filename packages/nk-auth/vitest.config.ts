import { defineConfig } from "vitest/config";

// Server-side config/env logic; no DOM needed. The migration-chain test boots
// PGlite (Postgres-in-WASM): keep files serial (pglite-socket is
// single-connection) and give the boot + migrate room past the 10s hook default.
export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
		fileParallelism: false,
		hookTimeout: 30_000,
	},
});
