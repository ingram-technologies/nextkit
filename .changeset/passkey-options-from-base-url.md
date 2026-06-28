---
"@ingram-tech/nk-auth": minor
---

Add `passkeyOptionsForBaseUrl(baseURL, rpName)`: derives the passkey plugin's
`rpID` (the base URL's hostname — the WebAuthn effective domain, no scheme or
port) and `origin` (the URL itself) from a single base URL, keeping them in
lockstep. Covers the common single-origin site so consumers no longer hand-roll
`new URL(baseURL).hostname`. Multi-origin / parent-registrable-domain sites
still call `makePasskeyOptions` with explicit values.
