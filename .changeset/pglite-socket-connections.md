---
"@ingram-tech/nk-db": minor
---

PGlite dev server: accept several connections. `createPgliteServer` (and so
`nk dev`) now passes `maxConnections` to pglite-socket, default 20 (new
option), instead of inheriting its default of 1, which refused every pool
after the first that `next dev` creates and failed authed pages with
"Connection terminated unexpectedly". It also patches pglite-socket's query
queue so concurrent connections' extended-protocol batches no longer
interleave on PGlite's one session (electric-sql/pglite#1046), a failed
message no longer stalls the queue, a failed batch gets one ReadyForQuery
instead of two (electric-sql/pglite#958), and a transaction that waits on a
second connection is logged as `nk(pglite): queue stalled …` instead of
hanging silently.
