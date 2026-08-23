---
"@ingram-tech/nk-seo": minor
---

Fix the self-referencing canonical for the `"query"` hreflang strategy, and add
`@ingram-tech/nk-seo/verify`.

`hreflangAlternates` treated "default locale" and "bare path" as the same thing,
which only holds for the `"prefix"` strategy. Under `"query"` every locale has
its own `?hl=` address and the bare path is the negotiating `x-default`, so
`?hl=en` was canonicalizing away to the bare path and deleting the default
locale from its own cluster. It now canonicalizes to itself. Prefix behaviour is
unchanged.

**This changes emitted canonical URLs for query-strategy sites that pass
`currentLocale`.** That is the point, but re-crawl expectations accordingly.

`verify` adds `verifyHreflangCluster` / `assertHreflangCluster`, which fetch
every advertised URL and fail on one that redirects, is not 200, canonicalizes
elsewhere, has no or duplicate canonicals, is non-reciprocal, or serves an
`<html lang>` contradicting its `hreflang`. hreflang is a set of promises about
other URLs; nothing local can tell you whether they hold.
