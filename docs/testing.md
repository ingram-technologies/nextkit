# Testing conventions

Mirrors `financica`, our reference codebase. Provided by
[`@ingram-tech/test-config`](../packages/test-config).

## Stack

- **Vitest** for unit and integration tests (jsdom environment, global APIs).
- **Playwright** for end-to-end tests.
- **@testing-library/react** + **jest-dom** for component tests.
- **v8** for coverage.

## Layout

- Unit/integration tests sit **next to the source** as `*.test.ts(x)`.
- E2E tests live under `e2e/`. Playwright is configured per-repo (it needs the
  app's own `build`/`start` commands), not in the shared package.
- Server-only library code (e.g. `@ingram-tech/email`) uses the **`node`**
  environment and skips the jsdom setup — see that package's `vitest.config.ts`.

## Scripts (per site)

```json
{
	"test": "vitest",
	"test:ui": "vitest --ui",
	"test:coverage": "vitest --coverage",
	"test:e2e": "playwright test"
}
```

## Principles

- **Prefer real over mocked.** Test pure functions directly; for data-layer
  code, integration-test against a **real local Supabase** rather than mocking
  the client. `financica` probes a local instance and skips gracefully when it
  isn't running — copy that pattern instead of over-mocking.
- **Mock only the boundary.** The shared setup mocks `next/navigation` so
  components render in isolation; that's the kind of thing worth mocking. Don't
  mock your own business logic.
- **Tests are part of CI.** `bun run ci` runs `check` + `type-check` + `test`.
  A change isn't done until CI is green.
