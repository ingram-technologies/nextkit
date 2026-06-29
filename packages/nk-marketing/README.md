# @ingram-tech/nk-marketing

Postgres-backed **marketing & lifecycle email**: contacts and consent,
newsletter audiences/subscriptions (broadcast), and **idempotent triggered
campaigns** (post-signup drips). RFC 8058 one-click unsubscribe throughout.
Sends via [`@ingram-tech/nk-email`](../nk-email).

It **owns its tables** and ships the migration; you inject an
`@ingram-tech/nk-db` pool (or any `pg` client) and a base URL. It defines its own
row types and never reaches into your schema.

## Install

```bash
bun add @ingram-tech/nk-marketing @ingram-tech/nk-email
```

## 1. Apply the schema

The migration lives in the package. Fold `migrations/0001_marketing.sql` into
your `drizzle/` pipeline (or apply it directly). It creates `marketing_contacts`,
`marketing_audiences`, `marketing_subscriptions`, and `marketing_deliveries` —
no RLS (reach them through your app role, like nk-billing).

## 2. Wire it up

```ts
import { createMarketing } from "@ingram-tech/nk-marketing";
import { pool } from "@/lib/db"; // your shared nk-db pool

const marketing = createMarketing({
	db: pool,
	baseUrl: "https://example.com",
	// unsubscribePath defaults to "/api/marketing/unsubscribe"
});
```

Point one route at `marketing.unsubscribe(token)` — it resolves either a
per-list subscription token (drops that audience) or a contact token (global
marketing opt-out) and is idempotent.

## Newsletters (broadcast)

```ts
await marketing.subscribe({ audienceSlug: "product-updates", email });

await marketing.sendBroadcast({
	audienceSlug: "product-updates",
	subject: "What's new",
	content: "First line.\n\nSecond paragraph.",
	cta: { label: "Read more", href: "https://example.com/post" },
	campaignKey: "2026-06-issue", // optional — makes a re-run idempotent
	// onlyTo: ["you@example.com"], // test send
});
```

Each recipient gets a per-subscription unsubscribe link; a globally opted-out
contact is excluded automatically.

## Lifecycle / triggered campaigns

For "send your first invoice 1 month after signup if they haven't yet" and
similar drips. **The division of labour:**

- **Your app owns the trigger.** A daily cron queries *your* schema for due
  contacts (signed up 30+ days ago, no invoice sent, etc.) — that condition
  depends on your tables, so it stays with you.
- **nk-marketing owns the cross-cutting parts.** For each due contact you call
  `sendLifecycle`, which suppresses global opt-outs, sends **at most once** per
  `campaignKey` per contact (claimed before send), attaches one-click
  unsubscribe, and renders.

```ts
// in /internal/cron/onboarding-followup, for each due contact:
const result = await marketing.sendLifecycle({
	campaignKey: "first-invoice-nudge",
	email: contact.email,
	userId: contact.userId,
	from: { name: "Acme" },
	subject: "Send your first invoice with Acme",
	content: "You're all set up — here's how to send your first invoice…",
	cta: { label: "Open dashboard", href: "https://example.com/dashboard" },
	footerReason: "you have an Acme account",
});
// result.status: "sent" | "duplicate" | "suppressed"
```

`sendLifecycle` throws only if the underlying send fails (releasing its claim
first so the next run retries) — wrap it best-effort so a mail outage never
blocks your cron.

## Rendering

The built-in renderer produces clean, dependency-free HTML + text. Override it
with `createMarketing({ render })` to use your own template (e.g. React Email).

Requires `@ingram-tech/nk-email`'s env (`CLOUDFLARE_*`, `EMAIL_FROM_DOMAIN`).
