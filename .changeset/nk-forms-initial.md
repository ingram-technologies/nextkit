---
"@ingram-tech/nk-forms": minor
---

Add `@ingram-tech/nk-forms`: the contact/signup submission pipeline. Composes
`bot-protection` (honeypot + timing token + Vercel BotID) and `nk-email`
(sending + `escapeHtml`) behind one `handleFormSubmission` handler, a
`renderNotificationEmail` builder that escapes every value, a `mintFormToken`
GET handler, and a `useFormSubmit` client hook. Sites keep their own schema,
fields, and delivery; the package owns the pipeline and its safety defaults
(silent bot-drop, escaped notifications, optional rate-limit hook).
