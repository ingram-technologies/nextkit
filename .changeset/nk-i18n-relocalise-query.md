---
"@ingram-tech/nk-i18n": patch
---

`urlForLocale` now replaces a locale the path already names instead of
appending a second one. Under `"query"`, relocalising `/p?hl=fr` to `en` used
to return `/p?hl=fr&hl=en`, which still reads back as French; other query
params are kept as they were. The path is also parsed before the locale is
added, so a fragment stays at the end (`/p#top` no longer yields
`/p#top?hl=en`) and, under `"prefix"`, `/fr?q=1` relocalises to `/en?q=1`
rather than `/en/fr?q=1`.
