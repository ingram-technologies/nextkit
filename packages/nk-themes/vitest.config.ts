import { defineConfig } from "vitest/config";

// Node environment: the only tests here cover the pure mode constants. The
// React surface (provider, toggle) is a thin pass-through to @wrksz/themes and
// is exercised by consuming sites, not unit-tested here.
export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.test.{ts,tsx}"],
	},
});
