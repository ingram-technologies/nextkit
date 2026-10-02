---
"@ingram-tech/nk-db": minor
---

PGlite dev server: the `nk(pglite): queue stalled …` warning now backs off (5s,
10s, 20s…, capped at a minute) instead of repeating every 5s, and steady
traffic from waiting connections can no longer postpone it. The optional
`@electric-sql/pglite-socket` peer now requires `>=0.2.11`, the release whose
query queue the multi-connection patch is written against; on older releases
the patch was skipped and concurrent connections could interleave.
