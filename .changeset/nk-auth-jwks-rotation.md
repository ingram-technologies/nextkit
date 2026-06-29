---
"@ingram-tech/nk-auth": patch
---

Harden `verifyBackendJwt` against Better Auth signing-key rotation. jose's
`createRemoteJWKSet` refuses to refetch the JWKS for its 30s cooldown after any
fetch, so a token signed with a freshly rotated key (whose `kid` isn't yet in
the cached set) failed for the whole cooldown window — surfacing as a ~30s burst
of auth failures on every token-verifying request. On a `JWKSNoMatchingKey` miss
we now force one `.reload()` (which bypasses the cooldown) and retry, so a
rotation costs one extra fetch instead of a brief outage. Backward-compatible.
