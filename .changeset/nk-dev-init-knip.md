---
"@ingram-tech/nk-dev": minor
---

Add **knip** to the bundled toolchain and run it under `nk check`.

- knip is now a hard dependency of nk-dev. New **`nk knip`** command, and
  **`nk check`** runs knip as part of the gate — but only when the repo has a
  knip config present (knip has no shareable config, so config-presence is the
  opt-in; sites that haven't adopted knip aren't suddenly gated).
- `nk init` now scaffolds a seed `knip.json` (ignoring `@ingram-tech/nk-dev`).

Also two fixes found during fleet rollout:

- `nk init` no longer writes a `vitest.config.ts` unconditionally — it prints the
  snippet as a hint instead. Many sites test with `bun:test`, where an unused
  Vitest config is just noise.
- The `to-nk-dev` codemod now also migrates `knip` config (`knip.json` and the
  package.json `knip` key): it swaps the old config-package names for
  `@ingram-tech/nk-dev` in `ignoreDependencies`, and rewrites
  `oxlint-config/{oxfmtrc,tier-b}.json` extends references (not just `oxlintrc`).
