---
"@ingram-tech/bot-protection": patch
---

Clarify in the timing-token docs that it is a *timing-window* gate, not a
per-submission nonce: a token can be replayed within its `[minMs, maxMs]` window,
so it composes with the honeypot and BotID layers rather than providing single-use
semantics on its own.
