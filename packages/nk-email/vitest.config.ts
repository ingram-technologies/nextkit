import { defineConfig } from "vitest/config";

// Email is server-side and touches no DOM, so it uses the `node` environment
// rather than the shared jsdom preset from @ingram-tech/nk-dev/vitest.
export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
});
