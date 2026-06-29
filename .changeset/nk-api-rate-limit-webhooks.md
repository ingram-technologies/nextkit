---
"@ingram-tech/nk-api": minor
---

Add two primitives every API seam was re-implementing:

- **Rate limiting** — `checkRateLimit` / `getClientKey` (framework-agnostic,
  zero-dep, per-instance fixed-window) plus a `rateLimit()` Hono middleware that
  emits the standard `429` envelope with `Retry-After` and `X-RateLimit-*`
  headers. The no-Redis default for cutting off single-client abuse.
- **Webhook signature verification** — `verifyHmacSha256` does a length-checked,
  constant-time HMAC-SHA256 compare (hex or base64, optional `sha256=` prefix)
  for the `/internal/webhooks/<provider>` route class. Stripe keeps using its
  own SDK via `nk-billing`.

Also adds `429` to the shared `errorResponses` map.
