---
"@ingram-tech/nk-auth": minor
---

`publicAuthIds(value, ids, { entity? })` converts a server-side `auth.api.*` result (organization, member list, invitation, session) to public user and organization ids with the same field-name rewrite the `publicSessionIds` plugin applies to HTTP bodies. Pass `entity: "organization"` (or `"user"`) when the top-level value is that entity, so its `id` is encoded too. Exported from the root and `./server`; `encodeSessionIds` now delegates to it.
