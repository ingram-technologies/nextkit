---
"@ingram-tech/nk-auth": minor
---

Grow nk-auth from the Supabase-RLS migration kit into the shared Ingram Better
Auth foundation — a toolkit of composable presets, not a wrapper.

- Add `./jwt`: `rlsJwtOptions` (moved here), plus `backendJwtOptions({ audience,
  expirationTime })` and `verifyBackendJwt({ token, jwksUrl, audience, issuer })`
  for sites whose JWT targets their own backend API rather than Supabase RLS.
- Add `./organization`: `nkOrganizationDefaults`, `lastActiveOrganizationUserField`,
  and `lastActiveOrganizationHooks(pool)` (restore the user's last active org on
  sign-in, persist on switch).
- Add `./pool`: `createAuthPool({ connectionString, caCert })` — a `pg` Pool with
  optional SSL CA verification.
- Move `better-auth`, `@better-auth/passkey`, `pg` to **peerDependencies** (with
  `pg`/passkey/supabase optional) so a consuming app has exactly one Better Auth
  copy. Add `jose` for `verifyBackendJwt`.

Existing exports (`createServerSupabase`, `bcryptPassword`, `makeEmailSenders`,
`makePasskeyOptions`, `uuidGenerateId`, `authEnv`) are unchanged.
