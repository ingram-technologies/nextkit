---
"@ingram-tech/nk-dev": patch
---

Toolchain: oxlint 1.80, knip 6.33, vitest 4.1.11, @ast-grep/cli 0.45.2.
oxlint 1.80 adds `react/refs` (no ref reads during render) to the react
plugin's defaults; a site that had the pattern gets new findings from `nk lint`.
