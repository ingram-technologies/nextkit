---
"@ingram-tech/nk-auth": patch
---

The chain check resolves the shipped `migrations/` folder through the package manifest at call time (`authMigrationsFolder()`, replacing the `AUTH_MIGRATIONS_FOLDER` constant 0.17.0 exported for an hour). The constant was built with `new URL("../migrations", import.meta.url)`, which Turbopack treats as an asset to inline and fails a site's `next build` on ("Can't resolve '../migrations'").
