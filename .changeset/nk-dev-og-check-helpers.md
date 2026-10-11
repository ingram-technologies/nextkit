---
"@ingram-tech/nk-dev": patch
---

The `nk doctor` Open Graph check no longer flags a card passed to a metadata
helper (`createPageMetadata({ openGraph: { ... } })`, `return pageMetadata({ ... })`).
Such a helper can add the image itself (nk-seo's `createMetadata` merges its
`defaultImage` into the override), and a text check cannot see that. A card the
file builds itself (`export const metadata = { ... }`, `return { ... }`) is
still checked.
