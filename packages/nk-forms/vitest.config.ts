import { defineConfig } from "vitest/config";

// Server-side logic only; the client hook is exercised in consuming sites.
export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
});
