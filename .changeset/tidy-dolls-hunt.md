---
"@ingram-tech/nk-dev": patch
---

Agent guide: data migrations must assert how much data they moved.

A backfill that silently moves nothing — an RLS mask on the source table, a
wrong `where` — commits and reports success. When the same migration then drops
the source columns, the data is gone. The rule is a row-count assertion inside
the transaction: count the expected rows, compare against `get diagnostics`
`row_count`, `raise exception` on a mismatch.
