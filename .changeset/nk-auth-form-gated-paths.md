---
"@ingram-tech/nk-auth": minor
---

`FORM_GATED_AUTH_PATHS`: the Better Auth endpoints a site serves through nk-forms (sign-up, password reset request, verification resend). Pass them as `disabledPaths` so the raw HTTP routes cannot bypass the bot gate and per-address limits; server-side `auth.api.*` calls keep working. The README now sends the set-password link server-side to the session's own address.
