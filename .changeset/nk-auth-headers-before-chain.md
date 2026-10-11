---
"@ingram-tech/nk-auth": patch
---

`getSession()` reads the request headers before running the auth-chain check.
It used to query the database first, so a page that only calls `getSession()`
(a prerender candidate until something reads the request) hit the database at
build time and failed the build wherever none is reachable, such as CI. Now
Next's dynamic bailout happens first and the build never queries the database.
