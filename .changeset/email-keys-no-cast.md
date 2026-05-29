---
"@ingram-tech/email": patch
---

`keys()` now narrows the validated env vars with a combined guard instead of
`as string` casts — no behavior change, but it follows the house "no `as` on
external input" rule that the package documents.
