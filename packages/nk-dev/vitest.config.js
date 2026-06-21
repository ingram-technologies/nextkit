import { defineConfig } from "vitest/config";

// nk is a Node CLI with no DOM; tests live in test/ so they stay out of the
// published `files` (bin, lib).
export default defineConfig({
	test: {
		environment: "node",
		include: ["test/**/*.test.js"],
	},
});
