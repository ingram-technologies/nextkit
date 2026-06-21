# @ingram-tech/nk-billing

The Ingram billing foundation: composable **Stripe primitives** every site was
re-implementing, plus an optional **Postgres credit ledger** for usage metering.
One account-agnostic toolkit, not a billing framework that owns your flows —
you keep your routes, your schema, and your pricing; nk-billing removes the
boilerplate in between.

> Part of [nextkit](../../README.md). Stateless Stripe helpers are the main
> entry; the database-backed credit ledger lives behind the `/credits` subpath so
> a subscription-only or wallet-only site never imports a DB concept.

## Install

```bash
bun add @ingram-tech/nk-billing stripe
```

`stripe` is a direct dependency; bring your own Postgres (`pg` / nk-db) only if
you use the credit ledger.

## Env contract

Single-mode (most sites): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
Dual-mode (a merchant-of-record running test beside live, e.g. cloud):
`STRIPE_SECRET_KEY_{TEST,LIVE}`, `STRIPE_WEBHOOK_SECRET_{TEST,LIVE}`.
Optional `STRIPE_API_VERSION` to pin ahead of an SDK bump.

Nothing hardcodes a price ID — prices resolve at runtime by stable Stripe
`lookup_key`, so the same code path works in test and live.

## The three billing models

Pick the one that matches what you sell — they compose:

- **Subscriptions** — `createCheckoutSession({ mode: "subscription" })`,
  `createPortalSession`, `summarizeSubscription`, `fetchSubscriptionSummary`
  (the webhook-lag self-heal read).
- **Stripe-side wallet** (money) — `@ingram-tech/nk-billing` `readBalance` /
  `debitBalance`: the balance lives in Stripe, no local table.
- **In-app credits** (abstract units) — `@ingram-tech/nk-billing/credits`:
  atomic `spendCredits` / `requireCredits`, `grantCredits`,
  `recordSubscriptionStatus`, all idempotent; ships its own migration.

## Quick start — subscription checkout

```ts
import { createCheckoutSession, resolveCurrencyFromHeaders } from "@ingram-tech/nk-billing";
import { headers } from "next/headers";

const url = await createCheckoutSession({
	customer: { metadataKey: "acme_org_id", id: orgId },
	customerDetails: { name: org.name, email: user.email },
	lookupKey: "acme_pro_monthly",
	mode: "subscription",
	currency: resolveCurrencyFromHeaders(await headers()),
	successUrl: `${base}/billing?ok=1`,
	cancelUrl: `${base}/billing`,
});
redirect(url);
```

## Quick start — webhook (with credit-ledger dedup)

```ts
import { readStripeWebhook } from "@ingram-tech/nk-billing";
import { grantCredits, recordSubscriptionStatus } from "@ingram-tech/nk-billing/credits";

export async function POST(request: Request) {
	const res = await readStripeWebhook(request, process.env.STRIPE_WEBHOOK_SECRET ?? "");
	if (!res.ok) return new Response(res.message, { status: res.status });
	// dedupe + apply inside your tenant transaction; retries are no-ops.
	await withTenant(orgId, (db) => recordSubscriptionStatus(db, { ... }));
	return Response.json({ received: true });
}
```

## Credit ledger & tenancy

The ledger takes the DB connection by **injection** and leaves isolation to you —
wrap each call in `withTenant(orgId, db => spendCredits(db, …))` under RLS, or a
plain transaction under app-layer filtering. It owns two tables; apply
`migrations/0001_billing.sql` (a Drizzle-composable fragment) and add your own
RLS policy if your stack uses one. See [`src/credits.ts`](./src/credits.ts).

## Full surface

See the [nk-billing guide](../../../nk-billing.md) for the exhaustive,
per-export reference and migration recipes for each consuming app.

## License

[MIT](../../LICENSE) © Ingram Technologies
