---
"@ingram-tech/nk-dev": patch
---

Docs: the agent guide now says to type-check with `nk type-check` rather than
bare `tsc`, and explains that a `tsc` error inside `.next/` (a deleted route or
a killed `next dev` leaving `.next/dev/types/validator.ts` stale) is generated
output that `nk type-check` recovers from on its own. The README describes
that recovery and `nk clean` instead of summarising the command as
`next typegen && tsc --noEmit`.
