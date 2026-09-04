---
"@ingram-tech/nk-dev": minor
---

vitest 5. The shared config and setup file are unchanged, and no test in
nextkit needed an edit, but a site's suite may notice the new defaults:

- mocks are cleared before every test (state no longer accumulates across
  tests unless you opt out with `clearMocks: false`);
- an un-awaited `expect(...).resolves/rejects` now fails the test;
- `vi.mock` outside a file's top level throws;
- `sequential` is gone (tests are sequential unless `concurrent`);
- jest-dom's `toHaveTextContent` is strict; use `toMatchTextContent` for
  substring matching;
- report and attachment output moves under `.vitest/` (add it to
  `.gitignore`);
- `-t` uses `>` as the suite separator;
- Node 22 is the floor, which nk-dev's `engines` already required.
