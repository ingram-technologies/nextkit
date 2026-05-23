# @ingram-tech/test-config

Shared [Vitest](https://vitest.dev) configuration and setup, mirroring
`our reference codebase`: jsdom environment, global APIs, v8 coverage, jest-dom matchers,
and Next.js navigation mocks.

## Install

```bash
bun add -d @ingram-tech/test-config vitest jsdom @testing-library/jest-dom @testing-library/react
```

## Use

`vitest.config.ts`:

```ts
import { resolve } from "node:path";
import { defineConfig, mergeConfig } from "vitest/config";
import { nextkitTestConfig } from "@ingram-tech/test-config";

export default mergeConfig(
	nextkitTestConfig,
	defineConfig({
		resolve: {
			alias: { "@": resolve(__dirname, "./src") },
		},
	}),
);
```

Add the scripts (mirrors our reference codebase):

```json
{
	"scripts": {
		"test": "vitest",
		"test:ui": "vitest --ui",
		"test:coverage": "vitest --coverage",
		"test:e2e": "playwright test"
	}
}
```

## Conventions

- **Unit/integration tests** live next to source as `*.test.ts(x)`.
- **E2E tests** use Playwright under `e2e/` (Playwright is configured per-repo,
  not here, since it needs the app's own build/start commands).
- **Server-only packages** that don't touch the DOM should set
  `test.environment: "node"` and skip the shared setup — see
  `@ingram-tech/email` for that pattern.
- Prefer testing pure functions and integration against a real local backend
  over heavy mocking. See [`docs/testing.md`](../../docs/testing.md).
