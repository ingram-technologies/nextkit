---
"@ingram-tech/nk-dev": minor
---

New `nk doctor` check: a page or route under `app/auth/` that shadows a Better
Auth endpoint. nextkit sites mount Better Auth at `/auth` through the
`[...all]` catch-all, and sign-in pages live in the same namespace — but in the
App Router a static segment always beats a catch-all, so a page whose path
matches an endpoint silently takes it over: GETs render the page, POSTs to the
endpoint return 405, and the auth flow breaks with no build-time signal. The
incident class is real — a reset page named `/auth/reset-password` shadows
`POST /auth/reset-password`, which is why the convention is to name that page
`/auth/set-password`.

The check derives the endpoint list textually from the installed better-auth's
`dist/api/routes` (`createAuthEndpoint("...")` — no site or dependency code is
executed), maps the `app/auth/**` tree to URL paths (`(group)` stripped,
`_private` and `@slot` trees skipped, `[param]` as a wildcard), and matches
segment-wise with endpoint `:param` wildcards. Core-endpoint collisions are
errors; `dist/plugins` collisions are warnings, since only enabled plugins are
live and we can't tell which without executing the auth config. Sites without
the `[...all]` mount or without better-auth are silently skipped, and a
better-auth dist layout we can't grep degrades to a warning, never a hard
error.

This is a doctor check, not an oxlint rule, because the collision is a property
of the route *tree* against a dependency's dist — no single file's AST contains
it.
