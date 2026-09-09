---
"@ingram-tech/nk-auth": patch
---

`createAuthMiddleware` detects the session cookie under `sessionCookiePrefix`, not only the default `better-auth` name. An app with its own `advanced.cookiePrefix` previously looped between the gate (no cookie seen) and the server guard (valid session).
