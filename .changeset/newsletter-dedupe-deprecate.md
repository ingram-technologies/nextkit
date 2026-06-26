---
"@ingram-tech/newsletter": patch
---

Deprecate in favour of `@ingram-tech/nk-marketing` (the Postgres/nk-db-native
successor) and stop duplicating helpers: `render.ts` now reuses `escapeHtml` and
`buildListUnsubscribeHeaders` from `@ingram-tech/nk-email` instead of keeping its
own copies. No API change — the exported `buildListUnsubscribeHeaders(url,
fromAddr)` keeps its signature and output.
