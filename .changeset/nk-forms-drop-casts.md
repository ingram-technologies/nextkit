---
"@ingram-tech/nk-forms": patch
---

Drop `as` casts on external input in favor of runtime narrowing (per
code-style.md). `handleFormSubmission` now narrows the parsed request body with
an `isRecord` type guard instead of casting it to `Record<string, unknown>`, and
the client `getErrorMessage` helper relies on `in`-narrowing rather than
`as { error: string }`. No behavior change.
