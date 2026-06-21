import { defineConfig } from "vitest/config";

// Pure unit tests only — env/currency/subscription/error logic. The Stripe and
// Postgres surfaces are exercised by the consuming site's integration tests, not
// here (we never hit the network or a database in this package's suite).
export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
});
