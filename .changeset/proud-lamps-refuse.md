---
"@ingram-tech/nk-dev": patch
---

Fix `nk type-check` breaking on Next.js sites under TypeScript 7. `typescript@7`
(the native compiler) ships no JS compiler API — no `lib/typescript.js` — so
Next's `next typegen` decided TypeScript "wasn't installed" and tried to
auto-install it with whatever package manager it sniffed (vercel/next.js#95490).
nk-dev now follows the official side-by-side guidance from the TypeScript 7.0
announcement: `typescript` is aliased to `@typescript/typescript6` (the 6.x API
that Next and other API consumers require), while `@typescript/native` (aliased
`typescript@7`) keeps providing the `tsc` bin, so `nk type-check` still runs the
native compiler. Sites declaring their own `typescript` devDependency should
remove it or adopt the same alias pair — a bare `typescript@7` reintroduces the
breakage, and a bare `typescript6` alias leaves no `tsc` bin (bunx would then
fetch the npm `tsc` squatter package).
