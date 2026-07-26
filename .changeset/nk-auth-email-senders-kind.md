---
"@ingram-tech/nk-auth": minor
---

`makeEmailSenders` now covers all three auth mails and hands your sender enough
context to render a real, localized template.

The message passed to `send` gains `kind` (`"verify-email" | "reset-password" |
"change-email"`), the full `user` (`id`, `email`, `name`), the raw `token`, the
originating `request`, and `newEmail` on change-email. Existing senders that
destructure `{ to, subject, url }` keep working unchanged.

Adds **`sendChangeEmailConfirmation`**, so `user.changeEmail` no longer has to
be hand-wired. That mattered more than it looks: `betterAuth()` receives its
options through a generic, which switches **off** excess-property checking, so a
callback under a wrong-but-plausible name — `sendChangeEmailVerification` is the
one people reach for — compiles cleanly and never fires. Better Auth then falls
through to sending the *verification* mail to the **new** address, so the
current address is never told the account is moving and the confirm-from-the-
current-owner control silently does nothing. `options.ts` now pins all three
callback names to the real Better Auth option types, so an upstream rename
breaks nk-auth's build instead of quietly disabling a site's mail.

Sites could previously only tell these mails apart by string-matching the
English `subject`, and got no `user.id`, so auth mail could not be localized
while every other message could. Switch on `kind` instead.

The README's canonical example no longer shows `text: url, html: url` — a bare
link reads as phishing on exactly the mails that need trust most. It now points
at the registry's email components and the `no-reply` from-address convention.
