---
"@ingram-tech/nk-auth": patch
---

`passkeyOptionsForBaseUrl` registers the base URL's origin, not the URL as
given. A `BETTER_AUTH_URL` with a trailing slash or a path (`https://example.com/`,
`https://example.com/app`) used to become the WebAuthn `origin` verbatim, which
never equals the bare origin the browser reports, so every passkey ceremony
failed.

An empty `BETTER_AUTH_SECRET=` line no longer throws outside production: it
counts as unset and falls back to the dev placeholder, as a missing variable
already did. Production still requires a non-empty secret.
