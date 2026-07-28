---
"@ingram-tech/nk-email": minor
---

The send-log can now archive rendered bodies and carry site-defined correlation
data, so it can power a "preview exactly what was sent" surface — joined to your
own records — instead of only an audit trail.

`createMailer({ db, captureBody: true })` stores each send's rendered
`{ html, text }` in a new `body` jsonb column; `SendOptions.captureBody`
overrides it per send, which is how credential-bearing auth mail (verification,
reset, magic link) stays out of the archive while still being logged. Parts are
clamped at the exported `MAX_LOGGED_BODY_CHARS` (256k) and a clamped body is
marked `{"truncated": true}` so a preview can say so.

`SendOptions.meta` stores site-defined JSON in a new `meta` jsonb column — the
seam for linking a row back to your own records, since `nk_email_log` carries no
foreign key into a site's tables. Join on `(meta->>'personEmailId')::uuid`. Ids,
not payloads: it's capped at the exported `MAX_LOGGED_META_CHARS` (4k) serialized
and dropped rather than truncated if it doesn't fit or doesn't serialize, which
never costs you the row or the send. Independent of `captureBody`.

Both are **off by default** and each column is left out of the insert entirely
when unset — existing sites (and nk-marketing, which builds its mailer without
capture) are unaffected and need no new migration. Sites using either apply
`migrations/0002_email_log_extras.sql`; `body` additionally brings the two
burdens documented there and in the README: bodies containing live credentials,
and retention, since nothing expires them.

Docs: the README gains "Archiving bodies (opt-in)" with the purge recipe and
"Linking a row to your own records", and `docs/transactional-email.md` gains
"Send history and previews" separating the audit trail, the body archive, and the
catalog's sample renders.
