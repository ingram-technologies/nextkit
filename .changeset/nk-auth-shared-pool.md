---
"@ingram-tech/nk-auth": patch
---

`createAuthPool` now delegates to `createPool` from the new `@ingram-tech/nk-db`
dependency, so Better Auth and app queries share one pool implementation and TLS
code path (the "one pool per process" rule). Its signature is unchanged. One
behaviour change: connections to a local host (`127.0.0.1`/`localhost`) now cap
at `max: 1` (required by the PGlite socket); non-local pools are unchanged.
