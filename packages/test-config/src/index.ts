import type { ViteUserConfig } from "vitest/config";

/**
 * Default Vitest configuration for Ingram Technologies projects, mirroring the
 * `financica` setup: jsdom environment, global test APIs, v8 coverage, and the
 * shared setup file ({@link ./setup}) that wires up jest-dom matchers and
 * common Next.js mocks.
 *
 * Compose it in your `vitest.config.ts`:
 *
 * ```ts
 * import { defineConfig, mergeConfig } from "vitest/config";
 * import { nextkitTestConfig } from "@ingram-tech/test-config";
 *
 * export default mergeConfig(
 *   nextkitTestConfig,
 *   defineConfig({
 *     // project-specific overrides (e.g. resolve.alias for "@")
 *   }),
 * );
 * ```
 *
 * Server-only library packages that don't need a DOM should instead set
 * `test.environment: "node"` and skip the setup file.
 */
export const nextkitTestConfig: ViteUserConfig = {
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["@ingram-tech/test-config/setup"],
		include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			exclude: ["node_modules/", "**/*.d.ts", "**/*.config.*", "**/*.type.ts"],
		},
	},
};
