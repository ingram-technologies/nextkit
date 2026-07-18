---
"@ingram-tech/nk-i18n": patch
---

`negotiateAcceptLanguage` now matches case-insensitively on the **supported**
side too. It previously lowercased the header's primary subtag but compared it
against the raw `supported` array, so an entry with any uppercase or region
qualifier (`"EN"`, `"en-US"`) never matched despite the documented
case-insensitive contract. Both sides are now normalized on the primary subtag,
and the matching `supported` entry is returned verbatim (its own casing).
