---
"@ingram-tech/nk-auth": minor
---

Make `next` preservation composable, and loud when it is missing.

Until now `?next=` only survived a sign-in redirect if a site adopted both
`createAuthMiddleware` and `requireUser` verbatim: the middleware was the only
thing that set the `x-nk-auth-path` header, the guard's sign-in URL builder was
private, and a site that deviated from either lost `next` with no error. Every
"sign in to see this page" landed on the default page instead.

- `@ingram-tech/nk-auth/middleware` exports the two halves of the middleware on
  their own: `withAuthPathHeader(request, requestHeaders)` sets the header from
  a custom proxy in one line (the same `requestHeaders` shape as nk-i18n's
  `localeProxy`), and `clearStaleSession(request, config)` is the stale-cookie
  handshake. `createAuthMiddleware`'s middleware also accepts
  `{ requestHeaders }` so a site can forward its own headers through it.
- `createAuthHelpers` exports `signInTarget()`, the sign-in URL with `next` and
  `stale` computed, so a site's own guard wrapper does
  `redirect(await signInTarget())` instead of re-deriving it.
- Both accept `nextParam` (default `next`) and `isSafeNext` (default the
  internal-path validator), for a site with an existing param name or a
  trusted-origin allow-list.
- Outside production, `signInTarget()` warns once when the header is absent,
  naming the two ways to wire it.
