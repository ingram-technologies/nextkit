# @ingram-tech/nk-billing

## 0.2.1

### Patch Changes

- f0d0e25: Docs only: replace site-specific examples in code comments with generic
  placeholders. No runtime or API change.

## 0.2.0

### Minor Changes

- Add `@ingram-tech/nk-billing`: the Ingram billing foundation. Stateless Stripe
  primitives (lazy single/dual-mode client, customer resolution by metadata,
  prices by lookup_key, EUR/USD presentment currency, Checkout + Customer Portal,
  subscription-status normalisation, webhook verification) plus a Stripe-side
  wallet (`./balance`) and an injection-based Postgres credit ledger with
  event-dedup (`@ingram-tech/nk-billing/credits`, ships `migrations/0001_billing.sql`).
  Consolidates the `getStripe()` singleton + checkout/webhook/credit patterns
  independently grown in financica, integrain, thornhill, cloud, and domains.
