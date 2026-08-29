---
"@ingram-tech/nk-i18n": patch
---

`useT` no longer writes its message sources to a ref during render (flagged by
oxlint 1.80's `react/refs`). The memo keyed on the locale already runs the
current render's closure when the locale changes, so the ref bought nothing;
behaviour is unchanged.
