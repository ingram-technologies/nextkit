import { defineConfig } from "vitest/config";

// Server-side config/env logic; no DOM needed.
export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
});
