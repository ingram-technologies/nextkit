import { defineConfig } from "vitest/config";

// Node environment throughout: the reader/sources are server code, and the
// render/component tests assert on renderToStaticMarkup output, not the DOM.
export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.test.{ts,tsx}"],
	},
});
