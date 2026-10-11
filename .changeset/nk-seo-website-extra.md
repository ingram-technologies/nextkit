---
"@ingram-tech/nk-seo": patch
---

`createSeo().website()` passes `extra` through to the WebSite node, like every
other bound builder. It used to keep only `name`, `url` and `publisher`, so
`seo.website({ extra: { inLanguage: "fr" } })` silently dropped `inLanguage`.
