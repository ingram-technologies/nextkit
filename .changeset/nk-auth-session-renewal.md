---
"@ingram-tech/nk-auth": minor
---

Sessions stop expiring `expiresIn` after sign-in regardless of activity.
`createAuthHelpers` read with Better Auth's refresh on, from server components
that cannot set cookies: the refresh extended the database row but its new
cookie was dropped, so the browser's cookie still died on its sign-in max-age.
The server read now passes `disableRefresh`; a site renews from the browser by
mounting `authClient.useSession()` in its signed-in shell (README, "Session
lifetime"). New `sessionLifetime({ maxAge })` plugin clamps every refresh to
`createdAt + maxAge`, so a sliding session still ends.
