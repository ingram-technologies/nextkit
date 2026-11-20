---
"@ingram-tech/nk-dev": patch
---

Drop the TypeScript 6 compat aliases (`typescript` -> `@typescript/typescript6`, `@typescript/native`). nk-dev no longer ships a `tsc`: the site declares `typescript` ^7 itself, and `nk doctor` now reports a site whose `typescript` devDependency (or its workspace root's) is missing or not ^7, since the shared tsconfig sets `checkers`, which TS 6 rejects with TS5025. `nk doctor --fix` sets it to ^7. Pulumi programs are exempt.
