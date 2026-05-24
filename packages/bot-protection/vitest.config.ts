import { defineConfig } from "vitest/config";

// Server-side logic only; no DOM needed.
export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
});
