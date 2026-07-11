---
"@ingram-tech/nk-i18n": minor
---

`Translator` (the `t()` returned by `createT`/`useT`) now returns a branded `LocalizedString` instead of a plain `string`, and the type is exported. The brand is erased at runtime and `LocalizedString` is assignable to `string`, so this is backward-compatible — existing call sites keep compiling. Consuming sites can now tighten user-facing props (toast helpers, dialog titles, form labels) to require `LocalizedString`, which turns hardcoded English at those boundaries into a compile error and makes translatable text findable by type. Interpolation via `t("Hi {name}", { name })` stays branded; composing with `+`/template literals collapses back to `string`. Opt deliberately-untranslated text (a name, an id, a number) in with `x as LocalizedString`.
