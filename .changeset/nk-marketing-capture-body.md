---
"@ingram-tech/nk-marketing": minor
---

`createMarketing({ captureBody })` — archive the rendered html/text of
broadcast and lifecycle sends in `nk_email_log`, not just the envelope.

nk-email has supported this since it gained the `body` column, but
nk-marketing built its mailer with a hardcoded `{ db, defaultKind: "marketing" }`
and no way to pass the option through. The result was a dead end for operator
surfaces: marketing sends could be listed but never previewed, and there was no
site-side fix, because the mailer is constructed inside the client.

Off by default. The `body` column arrives with nk-email's
`0002_email_log_extras.sql`, so defaulting it on would make every send fail to
log on a site that has applied only `0001`. Turning it on means accepting that
stored bodies are personal data nothing expires for you.

This is one switch for the whole client rather than a per-send override as in
nk-email: marketing bodies carry no credential, so there is no equivalent of a
magic-link body to keep out of the archive.

Also documents the send log in the README, which described neither `logSends`
nor the log itself.
