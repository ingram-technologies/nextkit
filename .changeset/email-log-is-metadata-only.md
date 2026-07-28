---
"@ingram-tech/nk-email": patch
---

Docs: state the send-log's scope explicitly. `nk_email_log` is a **metadata**
audit trail — no rendered body, no foreign key into a site's own tables — so it
cannot power a "preview exactly what was sent" pane. A site that already has a
body-storing send log keeps it rather than migrating; the two coexist. The
README, the `log`/`mailer` module docs, and the migration comment now say so, and
`docs/transactional-email.md` gains a "Send history and previews" section
separating the three questions (audit trail, body archive, catalog sample
renders). No API or schema change.
