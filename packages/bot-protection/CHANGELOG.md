# @ingram-tech/bot-protection

## 0.2.0

### Minor Changes

- 70ed006: Add @ingram-tech/bot-protection: invisible layered form bot protection — honeypot
  - HMAC-signed timing token + optional Vercel BotID, with a "silently drop"
    verdict model.
- ddbac3b: Make the honeypot field name configurable and change the default from
  `company_url` to `contact_detail`.

  `company_url` collided with browser / password-manager autofill (both `company`
  and `url` are autofill categories), so it got filled for real users and their
  submissions were silently dropped with `reason: honeypot`. The new default
  avoids autofill-triggering tokens, and the `<HoneypotField/>` input now also
  sets `data-1p-ignore` / `data-lpignore` / `data-form-type="other"`.

  Forms that need a name which would clash with a real field can override it by
  passing `field` to `<HoneypotField/>` and the matching `honeypotField` to
  `verifyHuman()`.
