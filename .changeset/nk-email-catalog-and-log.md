---
"@ingram-tech/nk-email": minor
---

Add an optional send-log and an email catalog, so an operator surface can see
what a product sends, when, and to whom — without the package losing its
zero-dependency, fire-and-forget core.

- **`createMailer({ db? })`** wraps `sendEmail` and, when given a `Queryable`
  (a `pg` pool / nk-db helper, by injection — no `pg` dependency added), records
  every dispatch to `nk_email_log` as `sent`/`failed` with `kind`
  (`transactional` | `marketing`), recipient, subject, sender, `templateKey`,
  `campaignKey`, and error. Logging is best-effort — a log-write failure never
  fails the send. With no `db` the mailer is a pure pass-through to `sendEmail`.
- **`recordEmail(db, record)`** is the low-level writer (used by nk-marketing).
- **`defineEmailCatalog(entries)` / `serializeEmailCatalog(entries)`** declare a
  manifest of every message a product sends — each entry built from the real
  sender so a preview can't drift — and serialize it to a committed
  `email-catalog.json` an operator surface reads. No route, no send.
- New migration `migrations/0001_email_log.sql` (apply only if logging is on).
