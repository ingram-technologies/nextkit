---
"@ingram-tech/nk-seo": minor
"@ingram-tech/nk-i18n": patch
---

nk-seo: `createMetadata({ hreflang })` emits the locale cluster from metadata. Set it once on the site config (the nk-i18n routing object fits directly) and every `pageMetadata()` call gains `alternates.languages` (with `x-default`) and a canonical that follows the address; pass `urlLocale` on dynamic pages so a localized URL canonicalizes to itself. Because this goes through metadata rather than the `x-pathname` request header, it works on statically rendered routes (`force-static`), where `<HreflangLinks>` has no header to read and throws — the READMEs now say so and point at the metadata wiring as the preferred one. nk-i18n: docs only.
