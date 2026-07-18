---
"@ingram-tech/nk-i18n": minor
---

Implement the `MissingKeysPolicy` that was previously declared but inert.
`createT` and `useT` now accept a `{ missingKeys }` option: `"error"` throws on
a missing catalog entry, `"warn"` logs once per locale+key, and `"ignore"` (the
default, and the prior behavior) falls back silently to the English key. Pass a
locale's configured policy through, e.g.
`createT(locale, msgs, undefined, { missingKeys: config.locales[locale].missingKeys })`.
No behavior change unless you opt in.
