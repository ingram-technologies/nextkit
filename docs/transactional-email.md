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

## Send history and previews

Two questions sites ask about their mail look alike and are not the same:

| Question | Answered by | Where it lives |
| --- | --- | --- |
| "What went out, to whom, did it land?" | metadata audit trail | `nk_email_log` (nk-email's opt-in send-log) |
| "Show me the exact message this person received" | body archive | `nk_email_log.body`, with `captureBody` on |
| "What emails does this product send, and what do they look like?" | sample renders of the current code | `defineEmailCatalog` manifest |

The first two are one table in two configurations, and the split is deliberate.
`createMailer({ db })` logs metadata; `createMailer({ db, captureBody: true })`
plus `0002_email_log_extras.sql` archives the rendered `{ html, text }` as well. A
message archive is not a bigger audit trail — it is a different liability:

- **Auth mail must opt out.** A verification, reset or magic-link body carries a
  live credential; archiving it makes DB read access equivalent to account
  takeover. Pass `captureBody: false` on those sends (the metadata row is still
  written) and keep the body-reading operator surface on a tighter role than the
  metadata-reading one.
- **Retention is yours.** Bodies are personal data and nothing expires them.
  Schedule the purge when you turn capture on, not after the first request to
  erase someone — `update … set body = null` keeps the audit trail intact.

**Linking a row to your own records** goes through `meta`: site-defined JSON on
the row, joined as `(meta->>'personEmailId')::uuid`. `nk_email_log` carries no
foreign key into a site's tables — that is what keeps it standalone, RLS-free,
and appliable unchanged by every site — so `meta` is the seam, and it buys
correlation rather than referential integrity. Ids, not payloads.

**A site with its own body-storing log may fold it in, or keep it — both are
fine.** Bodies and your join both survive the move now, so the trade is a real
foreign key for a `meta` correlation, against running one log instead of two.
Nothing forces the choice, and a site can run both, as nk-marketing effectively
does by writing `nk_email_log` for broadcasts.

Whichever store backs it, an operator preview stays honest the same way: **build
it from the same function the real sender uses.** The catalog and the archive
answer different questions — "what does this email look like today" vs "what did
we actually mail on Tuesday" — and a site with an operator surface generally
wants both.

## Imports

Import `@ingram-tech/nk-email` directly. A thin per-app `@/lib/email` barrel that
`export * from "@ingram-tech/nk-email"` is fine when the app layers local helpers
on top — pick one style per app and stay consistent. Never redefine what
nk-email already exports.
