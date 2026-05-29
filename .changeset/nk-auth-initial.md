---
"@ingram-tech/nk-auth": minor
---

New package: Better Auth building blocks for Ingram Next.js sites, configured to
keep Supabase Postgres + RLS working via a JWT bridge. The site calls
`betterAuth` itself and spreads in our portable presets (`rlsJwtOptions` — the
RLS-preserving `jwt` plugin payload, `bcryptPassword` — verifies migrated
Supabase hashes, `uuidGenerateId`, `makePasskeyOptions`, `makeEmailSenders`).
Also ships `createServerSupabase` (the RLS-aware data client that attaches the
session JWT so `auth.uid()` keeps working), browser re-exports at
`@ingram-tech/nk-auth/client`, a Zod-validated env contract, and the hardened
Better Auth schema migration (deny-all RLS + UUID ids). See
`docs/better-auth-migration.md` for the migration runbook.
