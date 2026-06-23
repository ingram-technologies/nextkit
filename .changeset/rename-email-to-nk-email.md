---
"@ingram-tech/nk-email": minor
"@ingram-tech/newsletter": patch
---

Renamed the package from `@ingram-tech/email` to `@ingram-tech/nk-email` for
consistency with the other `nk-*` packages. The API is unchanged — update your
imports from `@ingram-tech/email` to `@ingram-tech/nk-email`. The old package is
deprecated on npm.

Also in this release: `sendEmail` now applies a default 30s request timeout
(override via the new `timeoutMs` option) instead of hanging indefinitely on a
stalled connection. `fromAddress` validates the display name — it rejects control
characters and newlines and RFC 5322-quotes names containing specials — so a name
can no longer malform the sender address.
