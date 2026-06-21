---
"@ingram-tech/bot-protection": patch
---

Emit valid Node ESM. The package is `"type": "module"` but its `dist/*.js`
shipped extensionless relative imports (`from "./fields"`), which the shared
base tsconfig's `moduleResolution: "bundler"` tolerates and emits verbatim —
invalid under Node ESM and Turbopack, and a recurring source of "Cannot find
module './x'" / `ERR_MODULE_NOT_FOUND` when the package is imported or
resolution-checked. Added explicit `.js` extensions to all relative imports and
switched the package's own build to `module`/`moduleResolution: "nodenext"`, so
tsc now errors (TS2835) on any extensionless relative import — the defect can't
silently return.
