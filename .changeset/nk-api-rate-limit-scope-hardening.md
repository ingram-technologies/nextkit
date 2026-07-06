---
"@ingram-tech/nk-api": patch
---

Harden the rate limiter, resource scopes, and client error parsing:

- Each `rateLimit()` middleware instance now has its own bucket namespace, so two limiters sharing a client key no longer read and drain a single bucket (a strict limiter could previously be tripped by traffic that only hit a lax one, and one request could burn two tokens).
- `checkRateLimit` with `limit <= 0` now admits nothing instead of leaking one request per window.
- `getClientKey` caps client-controlled header values at 64 chars so spoofed `x-forwarded-for` values can't bloat the bucket map.
- `scope(minRole)` now throws at build time when `createResourceScope` was given no `hierarchy` (previously it silently skipped role enforcement — fail open) or when `minRole` is not in the hierarchy, and a resolved role missing from the hierarchy is denied with 403.
- `parseErrorBody` / `unwrap` / `assertResponseOk` no longer crash on a JSON body of `null` and ignore non-string `error` fields, always falling back to the provided message.
