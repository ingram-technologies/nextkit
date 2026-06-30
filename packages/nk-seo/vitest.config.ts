import { defineConfig } from "vitest/config";

// The builders and metadata factory are pure functions; no DOM needed.
export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
});
