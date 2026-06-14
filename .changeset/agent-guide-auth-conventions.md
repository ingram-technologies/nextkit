---
"@ingram-tech/agent-guide": minor
---

Add login-auth URL conventions and list `@ingram-tech/nk-auth` under "What nextkit
provides". Better Auth (via nk-auth) mounts at `/auth` through `basePath:
authBasePath` — **not** the framework default `/api/auth` — so login / social OAuth
callbacks are `<site>/auth/callback/<provider>`, distinct from connector /
app-install callbacks at `/internal/connect/<provider>/callback`. Stops agents
defaulting to the `/api/auth` callback path and registering the wrong redirect URI.
