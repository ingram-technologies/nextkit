---
"@ingram-tech/nk-auth": minor
---

Fall back to an insecure `BETTER_AUTH_SECRET` placeholder outside production so
local dev and tests run without hand-setting it.

- When `NODE_ENV` is not `"production"`, a missing `BETTER_AUTH_SECRET` resolves
  to a well-known placeholder (`authEnv()` logs a one-time warning). This makes
  `nk dev` / plain `next dev` start with no auth setup, matching how `nk-db`
  supplies a local `DATABASE_URL`. The fallback lives in the owning package's env
  contract, not in the `nk` orchestrator.
- In production the secret stays strictly required — a missing value still throws
  at startup, so a deploy can never sign sessions with a guessable secret.
