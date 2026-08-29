---
"@ingram-tech/nk-i18n": patch
---

`LocaleRouting.hrefLangTags` and `hreflangConfigFor()`'s result keep the locale union (`L`) instead of widening to `string`; still assignable to nk-seo's `HreflangConfig`.
