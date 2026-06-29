---
"@ingram-tech/nk-db": minor
---

Add `decodeOrNull` to the `createIdRegistry` id helpers — the throw-free
counterpart to `decode`, returning `null` for a foreign or malformed prefixed
id. Lets routes validate an untrusted path/query id without a try/catch
(`ids.org.decodeOrNull(param) ?? notFound()`). Additive; existing helpers
unchanged.
