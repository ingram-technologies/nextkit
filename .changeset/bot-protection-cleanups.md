---
"@ingram-tech/bot-protection": patch
---

Small cleanups: `createFormToken` now warns at most once when
`BOT_PROTECTION_SECRET` is unset (it runs on every form render, so it previously
spammed the logs per request), matching the `warnOnce` pattern already used for
the BotID layer. The SSR and client honeypot traps now share one
`VISUALLY_HIDDEN` style constant so they can't drift (the client trap was missing
the `top` offset). Dropped a redundant `as Record<string, unknown>` cast in
`verifyHuman`'s field reader (the branch already narrows to that type).
