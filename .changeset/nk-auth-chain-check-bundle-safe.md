---
"@ingram-tech/nk-auth": patch
---

The per-request auth-chain check no longer reads `migrations/` from disk. Inside
a Next server bundle `require.resolve` becomes a numeric module id, so on a site
that records the chain, every `getSession()` threw `The "path" argument must be
of type string. Received type number`. The check now carries the shipped chain
in code (`SHIPPED_AUTH_CHAIN`, tags and hashes, test-guarded against
`migrations/`) and compares it with the recorded hashes. `assertAuthChainApplied`
is unchanged for scripts and health checks.
