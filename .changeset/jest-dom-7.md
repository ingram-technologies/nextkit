---
"@ingram-tech/nk-dev": patch
---

Move to `@testing-library/jest-dom` ^7.0.0, and bundle its new peer.

jest-dom 7 promotes `@testing-library/dom` to a required peer dependency with
no `peerDependenciesMeta.optional`. `nk-dev` now depends on it directly rather
than leaving every site to satisfy it: `nk-dev` already ships the test
toolchain (vitest, jsdom) as real dependencies, and the alternative is an
unmet-peer warning on install for any site that doesn't happen to pull
`@testing-library/react`.

The shipped `vitest/setup.ts` still imports cleanly, and 7.0.0 adds
`toContainAnyBy*` / `toContainOneBy*` matchers. jest-dom 7 also raises its Node
floor to 22, which the jsdom 30 `engines` change already covers.
