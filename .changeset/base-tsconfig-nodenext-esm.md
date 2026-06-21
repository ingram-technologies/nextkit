---
"@ingram-tech/nk-dev": patch
"@ingram-tech/nk-i18n": patch
"@ingram-tech/newsletter": patch
"@ingram-tech/nk-auth": patch
---

Make the shared TypeScript base emit valid Node ESM and enforce it. The base
preset (`@ingram-tech/nk-dev/tsconfig/base.json`) used `moduleResolution:
"bundler"`, which silently tolerates extensionless relative imports in
`"type": "module"` packages and emits them verbatim — invalid under Node ESM /
Turbopack, and a recurring source of `ERR_MODULE_NOT_FOUND` ("Cannot find
module './x'"). Switched the base to `module`/`moduleResolution: "nodenext"`, so
tsc now errors (TS2835) on any extensionless relative import.

This surfaced the same latent defect in three packages, now fixed by adding
explicit `.js` extensions to their relative imports: nk-i18n, newsletter, and
nk-auth (their published `dist` previously shipped extensionless ESM).

App consumers are unaffected: the Next.js preset (`nextjs.json`) overrides back
to `moduleResolution: "bundler"`, so app source still needs no `.js` extensions.
nk-auth also overrides to "bundler" because it imports `next/server` /
`next/headers` / `next/navigation`, whose type exports don't resolve under
NodeNext — its relative imports still carry `.js`, so its dist is valid ESM.
