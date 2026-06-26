---
"@ingram-tech/nk-email": minor
---

Add first-class one-click unsubscribe and a shared HTML escaper.

- `sendEmail` now accepts a typed `listUnsubscribe: { url, mailto? }` option and
  expands it into the correct RFC 8058 `List-Unsubscribe` /
  `List-Unsubscribe-Post` header pair (explicit `headers` still win). Any
  non-transactional send should set it for bulk-sender compliance.
- Export `buildListUnsubscribeHeaders({ url, mailto? })` for callers that build
  headers themselves.
- Export `escapeHtml(value)` — the five-character HTML escaper that had been
  copy-pasted into every email producer.
