---
"@ingram-tech/nk-auth": minor
---

Session ids in public form. `createAuthHelpers(auth, { ids: { user, organization? } })`
takes the site's registry helpers and presents `user.id`, `session.userId` and
`session.activeOrganizationId` as public ids (`usr_…`, `org_…`) on every read
through `getSession` / `getUser` / `requireSession` / `requireUser` — the same
form nk-db 2's `idColumn` returns, so session ids compare with rows without a
`publicId(...)` at each site. `encodeSessionIds` is exported for tests and
custom readers. `backendJwtOptions({ audience, ids: { user } })` mints the
backend JWT's `sub` and payload `id` the same way.

Better Auth itself keeps working on raw uuids underneath, and values read
straight from `auth.api.*` stay raw — the same rule as raw SQL vs `idColumn`.
RLS needs no change: nk-db decodes a prefixed `sub` before it reaches
`request.jwt.claims` (see its changeset).

Without `ids`, nothing changes.
