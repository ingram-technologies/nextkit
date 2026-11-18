---
"@ingram-tech/nk-auth": minor
---

New `publicSessionIds({ ids })` Better Auth plugin (from `@ingram-tech/nk-auth`): rewrites `user.id`, `session.userId` and `session.activeOrganizationId` to public form in the HTTP bodies of `/get-session`, `/sign-in/email` and `/sign-up/email`, so `authClient.useSession()` agrees with `createAuthHelpers({ ids })`. `auth.api.*` calls, the adapter, cookies and request inputs stay raw. `encodeSessionIds` and `SessionIds` are now also exported from the root entry (still from `./server`).

`verifyBackendJwt` takes an optional `ids: { user }` that returns a raw-uuid `sub` (and payload `id`) in public form, so tokens minted before a site opted in read like new ones. Without it, claims are returned exactly as signed, as before.
