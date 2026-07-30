---
"@ingram-tech/nk-dev": minor
---

`nk type-check` now recovers from damaged generated types, and `nk clean`
removes regenerable build artifacts.

`tsconfig.json` feeds Next's typed-routes output back into `tsc`. Killing
`next dev` mid-write leaves `.next/dev/types/validator.ts` truncated, and
`next typegen` does **not** repair that directory — it writes `.next/types` —
so `tsc` reports the same syntax error inside `.next/` on every subsequent run.
The error points at generated code, so the natural response is to hunt a type
error in `src/` that doesn't exist.

Worse, a syntax error in generated output suppresses semantic diagnostics
program-wide: real `src/` errors are hidden behind it. Confirmed against a
truncated validator, where `tsc` reported only the generated file while a
planted `src/` type error went unmentioned.

`type-check` now captures the first `tsc` run and, when **every** reported
error sits inside generated type output, cleans the artifacts, regenerates and
retries once. A run that also implicates `src/` is passed through untouched:
cleaning wouldn't fix those errors, and the retry would only cost a full `tsc`
pass. Recovery never turns a failing check into a passing one — it surfaces the
errors that were masked and still exits non-zero.

The artifact registry behind it is shared, and exposed as `nk clean` for manual
use: Next's generated types plus TypeScript incremental caches, the latter
discovered by extension rather than by fixed name (`tsBuildInfoFile` renames
them, and a repo can carry several). Only the generated *type* output is
removed — `.next/cache` is left alone, so recovery doesn't become a cold
rebuild.
