---
"@ingram-tech/nk-auth": minor
---

Stale sessions now self-heal, and sign-in returns the user to where they were
headed.

- `createAuthMiddleware` preserves the requested path as `?next=` when it
  redirects an unauthenticated user, injects an `x-nk-auth-path` header so server
  guards can do the same, and — on the `?stale=1` marker the guard adds for a
  present-but-invalid cookie — deletes the dead Better Auth cookies so a bad
  session is cleared instead of failing every request. New optional
  `sessionCookiePrefix` config (default `better-auth`).
- `createAuthHelpers` gains an options arg (`signInPath`, `sessionCookiePrefix`).
  `requireUser` / `requireSession` now build the sign-in redirect automatically
  with `next` (from the header) and `stale=1` (when a session cookie is present
  but invalid) — so they **no longer take a `redirectTo` argument**. Also exports
  `safeNext` to validate a `?next=` param against open redirects.

Breaking: `requireUser(redirectTo)` / `requireSession(redirectTo)` lost their
parameter; set the destination via the `signInPath` option instead, and let
`next` be derived automatically.
