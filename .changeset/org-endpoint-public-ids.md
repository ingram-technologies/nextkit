---
"@ingram-tech/nk-auth": minor
---

`publicSessionIds` now covers the organization plugin: every `/organization/*` response carries public user and organization ids, and an `/organization/*` request's `organizationId` / `userId` must be a public id (a raw uuid is refused with a 400). `/list-sessions` and `user.lastActiveOrganizationId` are rewritten too. Sites calling `authClient.organization.*` with raw ids must pass the public ones.
