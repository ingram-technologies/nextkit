# Transactional email conventions

Cross-cutting conventions for how a consuming site sends transactional /
lifecycle email (verification, password reset, magic-link, invitations, welcome,
usage notices). The pieces:

- **Transport** — [`@ingram-tech/nk-email`](../packages/nk-email/README.md), the
  zero-dependency Cloudflare Email Sending client (`sendEmail`, `fromAddress`,
  `escapeHtml`, `isConfigured`).
- **Templates** — copied in from the **registry**
  ([`ingram-technologies/registry`](https://github.com/ingram-technologies/registry))
  via `shadcn add`. React Email components you own and rebrand; they render
  `{ html, text }` which you hand to `sendEmail`. See that repo's README.

This doc is the thin "use them consistently" layer on top.

## Rendering

Render transactional mail from the shared registry components (`renderEmail(...)
→ sendEmail({...})`). React Email handles escaping — don't hand-assemble HTML
strings for these, and don't redefine `escapeHtml` (import nk-email's).

Apps with a deliberately distinct email identity (e.g. a bespoke monospace/dark
look) may keep their own components — copy-in *expects* some apps to opt out.

## From-address local parts

`fromAddress(displayName, localPart)` — keep the **display name per product**;
standardize the **local part**:

| Local part      | Use for                                                      |
| --------------- | ------------------------------------------------------------ |
| `notifications` | default — auth links, product/system notices, receipts, reports, usage |
| `invites`       | organization / team invitations                              |
| `support`       | human-reply support / contact threads                        |

**We deliberately do not use `no-reply`.** Auth mail is the first thing a user
ever receives from a product, and it is exactly the mail they are most likely to
answer — "I didn't request this", "this link is broken". Bouncing that reply, or
dropping it silently, is hostile at the worst moment. `notifications` is the
default for a reason: send auth links from it and let replies land somewhere a
human can see. `fromAddress(displayName)` already resolves to it, so this is the
path of least effort too.

It's a **convention, not a type** — the local part is a free string (other
values, i18n, etc. are fine). Don't encode this as a union; just follow it.

## Dev / unconfigured fallback

When `isConfigured()` is false (no `CLOUDFLARE_*` / `EMAIL_FROM_DOMAIN`, i.e.
local/dev):

- **Log the actionable URL** (sign-in / verify / reset / accept link) and
  `return`, so a developer can click through. `console.warn`/`console.info`.
- **Best-effort sends** (invitations, welcome, notices) additionally wrap the
  send in `try/catch` so a mail outage never rolls back the underlying action.
- **Load-bearing links** must not be silently dropped in production — prod
  always has email configured; a site that wants to be strict may `throw` when
  unconfigured instead of logging.

Keep the explicit `if (!isConfigured()) { …log…; return; }` at the call site —
positive polarity, no hidden control flow. We considered and **rejected** a
boolean guard helper (`ensureConfiguredOrLog`): the inverted `!guard()` check and
a name that hides a `throw` are footguns.

## Imports

Import `@ingram-tech/nk-email` directly. A thin per-app `@/lib/email` barrel that
`export * from "@ingram-tech/nk-email"` is fine when the app layers local helpers
on top — pick one style per app and stay consistent. Never redefine what
nk-email already exports.
