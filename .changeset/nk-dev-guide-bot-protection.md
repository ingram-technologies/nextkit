---
"@ingram-tech/nk-dev": patch
---

Update `guide.md` for nk-forms 0.3.0, which absorbed `@ingram-tech/bot-protection`.
The shipped guide still listed bot-protection in its package roster as "the
primitive nk-forms builds on" and told agents to import `checkBot` / `verifyHuman`
from it for non-form endpoints. That package no longer exists; both layers are
exported from the `@ingram-tech/nk-forms` root.

The repo was corrected when the packages merged, but that changeset bumped only
nk-forms, so the fix never reached npm — agents on nk-dev 0.13.0 were reading the
old roster. `guide.md` describes packages other than its own, so a change to any
package's public surface needs a nk-dev changeset alongside it.
