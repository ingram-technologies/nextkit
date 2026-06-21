---
"@ingram-tech/email": minor
---

`sendEmail` now applies a default 30s request timeout (override via the new
`timeoutMs` option) instead of hanging indefinitely on a stalled connection.
`fromAddress` validates the display name — it rejects control characters and
newlines and RFC 5322-quotes names containing specials — so a name can no longer
malform the sender address.
