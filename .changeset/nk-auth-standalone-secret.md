---
"@ingram-tech/nk-auth": minor
---

Add `authSecret()`, a standalone accessor for the session-signing secret that
applies the same rule as `authEnv()` (strictly required in production, an
insecure dev placeholder otherwise) without requiring `BETTER_AUTH_URL` or
`DATABASE_URL`. Sites that derive their own `baseURL` and open their own
database connection can now consume just the secret's prod/dev fallback instead
of re-implementing that security-sensitive default in the app. `authEnv()` is
unchanged and now composes the same underlying secret schema, so there is a
single source of truth for the placeholder-vs-required behaviour.
