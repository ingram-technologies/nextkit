---
"@ingram-tech/nk-auth": minor
---

Close the password reset/set loop so a site never touches Better Auth's
`account` table or endpoint names directly.

- `createAuthHelpers` gains `getLinkedProviders()` and `hasCredentialAccount()`
  (session-scoped, via Better Auth's `/list-accounts`). `hasCredentialAccount()`
  drives the "Change password" vs "Set password" decision on a security page: a
  social-only account has no email/password credential until it sets one.
- New `useResetPassword(authClient, { token })` hook at
  `@ingram-tech/nk-auth/client` — the headless state machine for a token-consumer
  reset/set page (invalid-token, submitting, success, and length + match
  validation). The site brings its own shell; `error.code` is stable for i18n.
- New pure `@ingram-tech/nk-auth/password` subpath (importable from both ends):
  `DEFAULT_MIN_PASSWORD_LENGTH` / `DEFAULT_MAX_PASSWORD_LENGTH`,
  `passwordSchema()`, `validateNewPassword()`, and `CREDENTIAL_PROVIDER_ID`, so
  the client form and the server validate against the same bounds.
- `reset-password.test.ts` pins the Better Auth guarantee the set-password path
  relies on — `resetPassword` creates the `credential` account when the user has
  none — against a real instance, so an upstream upgrade can't silently break
  setting a password for a social-only account.
- README §6 documents the whole flow, including the
  `.well-known/change-password` redirect convention for password managers.
