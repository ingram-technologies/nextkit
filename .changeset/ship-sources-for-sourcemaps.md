---
"@ingram-tech/bot-protection": patch
"@ingram-tech/nk-api": patch
"@ingram-tech/nk-auth": patch
"@ingram-tech/nk-billing": patch
"@ingram-tech/nk-blog": patch
"@ingram-tech/nk-db": patch
"@ingram-tech/nk-email": patch
"@ingram-tech/nk-forms": patch
"@ingram-tech/nk-i18n": patch
"@ingram-tech/nk-marketing": patch
"@ingram-tech/nk-seo": patch
"@ingram-tech/nk-themes": patch
---

Publish `src/` alongside `dist/`, so the emitted `.js.map` and `.d.ts.map` files
resolve. Bundlers no longer warn that "sourcemap points to missing source
files", stack traces map back to real TypeScript, and go-to-definition lands on
the annotated source instead of a generated `.d.ts`. Tests are excluded from the
tarball.
