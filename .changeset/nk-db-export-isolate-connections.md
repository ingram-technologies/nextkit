---
"@ingram-tech/nk-db": minor
---

Export `isolateConnections` from `@ingram-tech/nk-db/pglite`, so a harness that
builds its own `PGLiteSocketServer` (booted from a snapshot, say) gets the same
multi-connection fix `createPgliteServer` applies.
