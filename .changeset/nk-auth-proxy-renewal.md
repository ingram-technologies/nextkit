---
"@ingram-tech/nk-auth": minor
"@ingram-tech/nk-dev": minor
---

Sessions are kept alive from the proxy. `renewSession(request, response, auth)` (and `createAuthMiddleware({ …, auth })`) asks Better Auth's `/get-session` once per browser per `updateAge` and forwards the refreshed cookie, so an active person is never signed out on a fixed timer. Server reads still never refresh (they cannot set the cookie), and no client component is needed. `nk doctor` fails a site that binds `createAuthHelpers` and renews nowhere: every one of its sign-ins ends `session.expiresIn` after it began.
