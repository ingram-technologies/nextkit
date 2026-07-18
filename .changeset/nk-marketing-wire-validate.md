---
"@ingram-tech/nk-marketing": patch
---

`subscribeToWire` no longer casts Wire's response with `as` or swallows the body
with the inline `res.json().catch(() => ({}))` pattern (both flagged by
code-style.md). It parses the body with an explicit runtime guard instead —
staying zero-dependency, per the module's design — so an unexpected shape
resolves to `null` rather than a trusted-but-unvalidated value.
