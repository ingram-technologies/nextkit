import { defineConfig } from "vitest/config";

// Node environment throughout: the builders are pure functions, and the og
// render test needs node (jsdom breaks resvg's SVG→PNG step).
export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.test.{ts,tsx}"],
	},
});
