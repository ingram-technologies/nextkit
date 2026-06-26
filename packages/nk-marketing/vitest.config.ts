import { defineConfig } from "vitest/config";

// Pure unit tests: the rendering, consent, dedup, and send-orchestration logic
// are exercised against an in-memory fake of the few SQL statements the client
// issues (see client.test.ts). The real SQL is covered by the consuming site's
// integration tests against PGlite.
export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
});
