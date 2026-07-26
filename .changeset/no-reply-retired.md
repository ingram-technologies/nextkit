---
"@ingram-tech/nk-auth": patch
---

Docs: auth links send from the default `notifications` local part, not
`no-reply`. Auth mail is the first thing a user receives from a product and the
mail they are most likely to answer ("I didn't request this", "this link is
broken") — bouncing or silently dropping that reply is hostile at the worst
possible moment. `fromAddress(displayName)` already defaults to `notifications`,
so no code changes; the `no-reply` row is retired from the convention.
