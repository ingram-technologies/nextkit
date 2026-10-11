---
"@ingram-tech/nk-forms": patch
---

A `BOT_PROTECTION_SECRET` that holds no actual secret (`","`, or only spaces
and commas) now disables the timing layer like an unset one. It used to count
as configured, so minting a token threw and every submission was silently
dropped as `missing-token`.
