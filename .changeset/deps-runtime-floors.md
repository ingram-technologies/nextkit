---
"@ingram-tech/nk-auth": patch
"@ingram-tech/nk-billing": patch
"@ingram-tech/nk-blog": patch
"@ingram-tech/nk-db": patch
---

Raise runtime dependency floors: zod ^4.5.4 (nk-auth, nk-billing, nk-blog,
nk-db), jose ^6.2.10 (nk-auth), stripe ^22.6.0 (nk-billing). No API change.
