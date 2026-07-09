---
"@ingram-tech/nk-dev": minor
---

Bundle TypeScript 7 (`typescript@^7.0.2`), the native compiler. `nk type-check`
and every `tsc` invocation orchestrated by `nk` now run the Go-based tsc —
substantially faster, and a drop-in replacement for the 6.x CLI. TypeScript 7 is
a major release, so sites may surface new (correct) type errors after upgrading;
plain `next build` / `next dev` remain unaffected. Also bumps bundled knip to
^6.25 and vitest to ^4.1.10.
