---
"@ingram-tech/nk-auth": minor
---

Drop the `kysely@0.28.x` pin guidance. Better Auth's kysely adapter no longer imports `DEFAULT_MIGRATION_TABLE` from kysely's main entry (it mirrors the constant locally as of the v1.6.15 adapter, better-auth#9811), so kysely 0.29 no longer breaks the adapter or the Turbopack build. The `better-auth`/`@better-auth/passkey` peer floor is raised to `^1.6.15` to enforce that guarantee in the dependency range instead of in prose, and the README note is removed.
