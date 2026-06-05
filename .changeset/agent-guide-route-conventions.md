---
"@ingram-tech/agent-guide": minor
---

Add a "Route & URL conventions" section: `/api/…` is the public API only, and all
plumbing lives under `/internal/…` — the OAuth/app-install handshake at
`/internal/connect/<provider>/{start,callback}`, inbound provider webhooks at
`/internal/webhooks/<provider>`, and workers/crons at `/internal/{worker,cron}/<name>`.
Keeps connector wiring consistent across nextkit apps.
