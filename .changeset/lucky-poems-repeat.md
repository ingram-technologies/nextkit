---
"@ingram-tech/nk-dev": minor
---

Add two oxlint rules for `@ingram-tech/nk-i18n` translator calls.

`nextkit/t-requires-values` (error) flags a `t()` message whose ICU placeholders
have no values argument, or whose values object literal omits a required key.
The translator returns the message unformatted when no values are given, so
`t("Results for {query}")` renders the placeholder text to users with no runtime
warning at all — the one failure in that package with no signal behind it.

`nextkit/t-no-positional-args` (error) forbids numbered placeholders (`{0}`).
The English source is the catalog key, so a translator reads the placeholder and
may need to reorder it; a number tells them nothing.

Both read arguments with a brace-depth scan, so only top-level braces count:
`{count, plural, one {# item} other {# items}}` has exactly one argument. Braces
that don't open with an identifier are treated as text and ignored, leaving
prose and embedded JSON (`t('This is JSON: {"a": 1}')`) untouched — messages that
can't be ICU-escaped anyway, since the source string is the catalog key.
