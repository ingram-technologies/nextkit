# Marketing & lifecycle email: `@ingram-tech/nk-marketing`

**Status:** shipped. Postgres/nk-db-native marketing & lifecycle email. Read
[`philosophy.md`](./philosophy.md) (Django-app model, EU-first vendor stance)
first.

## Why this package exists

Two needs kept getting hand-rolled per site, and they share most of their
plumbing:

1. **Newsletters** — an audience opts in, you broadcast issues, each carries a
   one-click unsubscribe.
2. **Lifecycle / triggered email** — "send your first invoice 1 month after
   signup if they haven't yet", "trial ending", and similar drips.

Both need the same cross-cutting machinery: a contact identity, consent +
suppression, RFC 8058 one-click unsubscribe, idempotent delivery, and a clean
HTML/text renderer. nk-marketing does both on Postgres, reusing
[`@ingram-tech/nk-email`](../packages/nk-email) for transport (and its
`escapeHtml` + `buildListUnsubscribeHeaders`).

## Where the lines are drawn

This is the load-bearing decision. **Scheduling and eligibility live in the
consuming app; the cross-cutting send machinery lives in the package.**

- The app runs the cron and queries **its own** schema to decide *who* is due
  and *when* — that condition ("signed up 30+ days ago AND has never sent an
  invoice") depends on the app's tables, so it can't live in nk-marketing.
- nk-marketing owns what every campaign needs regardless of trigger:
  suppression (global opt-out), **exactly-once delivery** (claim before send),
  one-click unsubscribe, and rendering.

This mirrors nk-billing's ledger: ship the primitive, let the site own tenancy
and orchestration.

## Data model (`migrations/0001_marketing.sql`)

Four tables, no RLS (reached through the app role, like nk-billing):

- `marketing_contacts` — one row per email. The unit of identity and consent;
  holds the **global** unsubscribe token and `unsubscribed_all_at` (opting out
  here suppresses everything).
- `marketing_audiences` — broadcast lists (slug, name, sender identity).
- `marketing_subscriptions` — `(audience, contact)` opt-in, with a
  **per-list** unsubscribe token (dropping one list ≠ global opt-out).
- `marketing_deliveries` — `(campaign_key, contact)` idempotency log, claimed
  before every lifecycle send (and optionally broadcast) so a retry or an
  overlapping cron can't double-send.

`updated_at` is maintained in app code (the client sets it on every UPDATE), not
by a trigger, to keep the migration plpgsql-free and identical on PGlite.

## The two flows

```ts
import { createMarketing } from "@ingram-tech/nk-marketing";
import { pool } from "@/lib/db";

const marketing = createMarketing({ db: pool, baseUrl: "https://example.com" });
```

**Broadcast** (`src/client.ts` → `sendBroadcast`): enumerates active subscribers
not globally opted out, sends each a per-subscription unsubscribe link. Pass
`campaignKey` (the issue id) to make a re-run idempotent.

**Lifecycle** (`sendLifecycle`): upsert contact → suppressed? → claim
`(campaignKey, contact)` → duplicate? → send with a global unsubscribe link →
`sent`. The claim is released if the send throws, so the next cron run retries.
Returns `{ status: "sent" | "duplicate" | "suppressed" }`.

### Wiring a lifecycle nudge in a site (the canonical example)

```ts
// app/internal/cron/onboarding-followup/route.ts  (gated by CRON_SECRET)
// 1. SITE-OWNED eligibility query — depends on the site's own tables:
const due = await query<{ email: string; user_id: string }>(
  `select c.email, c.user_id
     from stripe_accounts a
     join contacts c on c.user_id = a.id
    where a.created_at < now() - interval '30 days'
      and not exists (select 1 from sends s where s.account_id = a.id and s.status <> 'error')`,
);
// 2. PACKAGE-OWNED send — suppression, once-only, unsubscribe, rendering:
for (const row of due) {
  await marketing.sendLifecycle({
    campaignKey: "first-invoice-nudge",
    email: row.email,
    userId: row.user_id,
    from: { name: "Acme" },
    subject: "Send your first Stripe e-invoice",
    content: "You're all set up — here's how to send your first invoice…",
    cta: { label: "Open dashboard", href: "https://example.com/dashboard" },
    footerReason: "you have an account with us",
  }).catch((e) => logger.error("nudge failed", { email: row.email, error: e }));
}
```

Route `/api/marketing/unsubscribe?token=…` straight at `marketing.unsubscribe(token)`
— it resolves either token kind and is idempotent.

## Transactional vs marketing — keep them separate

Welcome emails, receipts, "you're out of credits" are **transactional**: they
react to the user's own action, need no consent, and should NOT be gated by the
marketing opt-out. Keep sending those directly via `@ingram-tech/nk-email`.
nk-marketing is for **unsolicited / time-triggered** mail, which legally and for
deliverability needs the unsubscribe + suppression this package provides.
