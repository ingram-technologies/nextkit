---
"@ingram-tech/nk-auth": minor
---

Public ids on more of Better Auth's surface, a sanctioned id conversion for app code, and a `./client` that builds without the passkey peer.

- `publicSessionIds` now rewrites user ids in `/list-accounts` (a credential account's `accountId` too), `/magic-link/verify` and the passkey endpoints (`/passkey/list-user-passkeys`, `/passkey/update-passkey`, `/passkey/verify-registration`, `/passkey/verify-authentication`). The `userId` of `/get-access-token`, `/refresh-token` and `/account-info` must be a `usr_` id: it is decoded before Better Auth sees it and a raw uuid is a 400. Sites can drop these paths from `disabledPaths`.
- `authUserId(publicId, ids)` / `authOrganizationId(publicId, ids)` turn a public id into the uuid `auth.api.*` and the adapter take, and `publicUserId(rawId, ids)` goes the other way (an OAuth `sub`). Exported from `./` and `./server`; use them instead of `ids.user.decode(…)` / `ids.user.encode(…)`, which `nextkit/no-id-codec-in-app-code` flags.
- **Breaking:** `passkeyClient` moved from `@ingram-tech/nk-auth/client` to `@ingram-tech/nk-auth/client/passkey`, so `./client` no longer imports the optional `@better-auth/passkey` peer. Passkey sites change one import:

  ```diff
  -import { passkeyClient } from "@ingram-tech/nk-auth/client";
  +import { passkeyClient } from "@ingram-tech/nk-auth/client/passkey";
  ```
