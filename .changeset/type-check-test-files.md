---
"@ingram-tech/nk-auth": patch
"@ingram-tech/nk-api": patch
"@ingram-tech/nk-db": patch
"@ingram-tech/nk-email": patch
"@ingram-tech/nk-i18n": patch
"@ingram-tech/nk-seo": patch
"@ingram-tech/nk-blog": patch
---

Test files are now type-checked. Every package excluded `**/*.test.ts` from the
one tsconfig it used for both building and type-checking, so `tsc` never looked
at a single test — and vitest strips types without checking them, so nothing
did. Type-level assertions in tests were silently dead.

`tsconfig.json` now excludes only `node_modules` and `dist` (and is what
`type-check` and your editor use); the new `tsconfig.build.json` adds the test
globs back, so `dist` still ships no tests.

Fixing the 49 errors this surfaced was mostly mechanical (missing `.js`
extensions on relative imports, which the NodeNext base config has always
required), but three were real:

- **nk-auth** `migrations.test.ts` passed `migrationsTable`, which is not a
  `PgliteServerOptions` key and was silently ignored — the test applied its
  migration chain twice, once as a dependency chain and again as the default app
  chain. It now stubs the primary applier so it tests the shape it documents.
- **nk-seo** `metadata.test.ts` read `.type` off the `OpenGraph` union, where it
  is only present on the variants.
- **nk-i18n**'s missing-key tests pass keys an empty catalog types as `never`.
  They exercise the runtime missing-key policy, which exists for catalogs that
  drift at runtime, so they now carry an explicit `@ts-expect-error`.
