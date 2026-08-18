---
"@ingram-tech/nk-auth": patch
---

Tested against better-auth 1.7.0 (and `@better-auth/passkey` 1.7.0). nk-auth's
own surface is unaffected — it uses core email/password and `signIn.social`,
neither of which moved — so the peer range stays `^1.6.15` rather than rising
to `^1.7.0`: sites can upgrade nk-auth without being forced onto 1.7.

Sites that use the `genericOAuth` plugin do have a migration to do, and it is
silent at build time:

- `genericOAuth` no longer mounts its own endpoints. `auth.api.signInWithOAuth2({
  providerId })` is gone; the core `signInSocial({ provider })` replaces it.
- The callback moved from `/api/auth/oauth2/callback/<provider>` to
  `/api/auth/callback/<provider>`, which means the redirect URI registered with
  the upstream provider has to be updated too.

Note for `nk doctor`'s auth-shadow check: it derives plugin endpoints textually
from better-auth's `dist/plugins`, and 1.7 still *contains* the old
`createAuthEndpoint("/oauth2/callback/:providerId")` call even though the
endpoint is no longer mounted. So a plugin-collision warning can now be stale
for a second reason beyond "the plugin might not be enabled". These are
warnings, never errors, so the check degrades gracefully — but do not read a
plugin warning as proof the endpoint is live.
