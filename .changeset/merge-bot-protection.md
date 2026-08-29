---
"@ingram-tech/nk-forms": minor
---

Absorb `@ingram-tech/bot-protection` into nk-forms. Nothing in the fleet
depended on it directly — nk-forms was its only consumer and already re-exported
its whole surface — so the separate package bought a second version number,
changelog and release for 600 lines that were already an implementation detail.

Additive for nk-forms: `verifyHuman`, `checkBot`, `createFormToken`,
`verifyFormToken`, `HONEYPOT_FIELD`, `TOKEN_FIELD` and `isConfigured` now come
from the root, with `<HoneypotField>` at `/honeypot` and the field names at
`/fields`. `BOT_PROTECTION_SECRET` keeps its name, so no site config changes.
`botid` becomes an optional peer dependency of nk-forms.

Sites importing `@ingram-tech/bot-protection` directly (none known) should
switch the specifier to `@ingram-tech/nk-forms`; that package is deprecated on
npm.
