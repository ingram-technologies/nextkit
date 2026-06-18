---
"@ingram-tech/nk-db": minor
---

Export `resetPublicTables` from a new `@ingram-tech/nk-db/pglite/reset` subpath —
the canonical "introspect public tables + TRUNCATE … RESTART IDENTITY CASCADE"
test-reset, transport-agnostic so an in-process Drizzle/PGlite harness can share
it without pulling in PGlite or the socket server. `createTestDb`'s `reset()` now
delegates to it (behaviour unchanged). The subpath is deliberately zero-import so
in-process consumers don't pay for the socket transport.
