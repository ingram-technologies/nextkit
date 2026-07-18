---
"@ingram-tech/nk-forms": patch
---

Re-export `checkBot` from the package root. Sites guarding a non-form endpoint
(a checkout, an authed route) with the raw Vercel BotID layer can now import it
from `@ingram-tech/nk-forms` and drop their direct `@ingram-tech/bot-protection`
dependency entirely.
