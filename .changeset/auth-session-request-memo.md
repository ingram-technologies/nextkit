---
"@ingram-tech/nk-auth": patch
---

`createAuthHelpers`: memoize the validated session read per request with React `cache()`. A render fanning out many `getUser()` / `requireUser()` calls now validates the session against the database once per request instead of once per call (measured 9 → 1 on a financica page). Caveat: mutating the session mid-request and re-reading it through the helpers returns the pre-mutation snapshot; read `auth.api.getSession` directly in that case.
