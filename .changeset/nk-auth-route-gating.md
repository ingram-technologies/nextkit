---
"@ingram-tech/nk-auth": minor
---

Add App Router route-gating helpers that make the classic auth redirect loop
structurally impossible.

- `@ingram-tech/nk-auth/server` — `createAuthHelpers(auth)` returns validated,
  DB-backed `getSession` / `getUser` / `requireUser` / `redirectIfAuthenticated`,
  bound once to the site's Better Auth instance (generic over the site's session
  type, so the user shape stays fully inferred).
- `@ingram-tech/nk-auth/middleware` — `createAuthMiddleware(config)` is a
  loop-safe edge middleware: it only redirects *cookie-less* requests off
  `protectedPaths`, and optionally cookie-bearing requests off a front door. It
  refuses, at construction, to protect or front-door the sign-in path — the one
  optimistic redirect that lets a stale/revoked cookie ping-pong with the
  validated server guard forever.

Adds `next` as an optional peer dependency (the new subpaths import it; the
framework-agnostic core entry still does not).
