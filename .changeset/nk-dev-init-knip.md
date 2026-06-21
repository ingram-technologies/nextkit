---
"@ingram-tech/nk-dev": patch
---

Two fixes found during fleet rollout:

- `nk init` no longer writes a `vitest.config.ts` unconditionally — it prints the
  snippet as a hint instead. Many sites test with `bun:test`, where an unused
  Vitest config is just noise.
- The `to-nk-dev` codemod now also migrates `knip` config
  (`knip.json` and the package.json `knip` key): it swaps the old config-package
  names for `@ingram-tech/nk-dev` in `ignoreDependencies`, and rewrites
  `oxlint-config/{oxfmtrc,tier-b}.json` extends references (not just `oxlintrc`).
