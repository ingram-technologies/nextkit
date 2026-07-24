---
"@ingram-tech/nk-marketing": minor
---

Record broadcasts and lifecycle sends to nk-email's `nk_email_log` as
`kind: "marketing"` (with the send's `campaignKey`), so marketing history shows
up in the same send-log an operator surface reads. Sends now route through
nk-email's `createMailer` instead of `sendEmail` directly — a pure pass-through
when logging is off. Opt out with `createMarketing({ logSends: false })`;
logging requires nk-email's `0001_email_log.sql` migration and is best-effort
(a logging failure never blocks a send).
