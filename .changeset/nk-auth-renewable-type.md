---
"@ingram-tech/nk-auth": patch
---

`renewSession` and `createAuthMiddleware({ auth })` accept any real Better Auth instance. 0.22.0 typed the config fields it reads as all-optional objects, which TypeScript rejects for a config whose `session` or `advanced` shares none of them.
