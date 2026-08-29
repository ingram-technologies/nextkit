---
"@ingram-tech/nk-dev": minor
---

`nk doctor` warns when a site binds `createAuthHelpers` but nothing sets the
`x-nk-auth-path` header (neither `createAuthMiddleware` nor
`withAuthPathHeader`): the guards' `?next=` is lost silently in that shape.
`guide.md` names the composable nk-auth middleware pieces.
