# @ingram-tech/nk-billing

## 0.3.6

### Patch Changes

- 798b39d: Rewrite the READMEs for an outside reader. These packages are published under an
  open-source licence, but the prose addressed the reader as if they worked here:
  "the Ingram billing foundation", "every Ingram API looks the same", "the one
  shared email client for Ingram sites", "the fleet-uniform view". That framing is
  gone, along with the pose it came with — unsourceable claims ("the one SEO
  safeguard everyone forgets on Vercel"), negation-reframes, bold scattered on
  non-key phrases, and roughly forty mid-sentence em-dashes.
  
  Documented failure modes, gotchas and code examples are unchanged. No API,
  identifier, env var or technical claim was touched.

## 0.3.5

### Patch Changes

- 9262afb: Publish `src/` alongside `dist/`, so the emitted `.js.map` and `.d.ts.map` files
  resolve. Bundlers no longer warn that "sourcemap points to missing source
  files", stack traces map back to real TypeScript, and go-to-definition lands on
  the annotated source instead of a generated `.d.ts`. Tests are excluded from the
  tarball.

## 0.3.4

### Patch Changes

- 2b21f3a: Routine runtime dependency bumps: `jose` 6.2.9 (nk-auth), `stripe` 22.5.0
  (nk-billing), `intl-messageformat` 11.2.14 (nk-i18n), and `@wrksz/themes` 1.2.0
  (nk-themes). No API changes in any of them — the `@wrksz/themes` minor is
  purely additive (new `./client/use-hydrated` and `./script` subpath exports,
  neither re-exported by nk-themes today).

## 0.3.3

### Patch Changes

- 6cf2320: Raise runtime dependency floors to the current patch/minor releases.

  `nk-auth` moves to `jose` ^6.2.6, `nk-billing` to `stripe` ^22.4.0, `nk-i18n` to
  `intl-messageformat` ^11.2.13, and `nk-dev` to `oxlint` ^1.76.0, `knip` ^6.31.0
  and `@testing-library/jest-dom` ^6.10.0.

  No API changes. `nk-dev` ships the toolchain as real dependencies, so its bump
  is what moves a consuming site's linter and dead-code checker — the new `oxlint`
  reported no findings against this repo.

## 0.3.2

### Patch Changes

- 8eec90d: Bump `stripe` to 22.3.2 (latest patch).

## 0.3.1

### Patch Changes

- 91bd974: Make the webhook credit mutators atomic on a bare pool. `grantCredits`,
  `refundCredits` (with an `eventId`), and `recordSubscriptionStatus` previously
  issued the `claimStripeEvent` insert and the balance/status write as two separate
  statements — atomic only if the caller wrapped them in a transaction, which
  `Queryable` (satisfied by a bare `pg.Pool`) does not enforce. A crash between the
  two would commit the claim while dropping the mutation, permanently marking the
  Stripe event processed with the credits never applied (the retry then no-ops).
  Each now folds the claim and the mutation into one `WITH claim AS (…)` statement,
  so the pair commits or rolls back together even under autocommit. Behavior is
  otherwise unchanged (idempotency, out-of-order status defense, return values).
- 67046b8: Small consistency fixes: `getBillingSummary` now guards the `trial_started_at`
  parse with `Number.isFinite` (matching `entitled()`), so an unparseable
  timestamp yields `trialEndsAt: null` instead of `NaN`; `readBalance` falls back
  to `DEFAULT_CURRENCY` instead of a duplicated hardcoded `"eur"`; and the `keys.ts`
  docstring now describes the real `billingEnv().webhookSecret` fields rather than
  non-existent `webhookSecret()` helper functions.

## 0.3.0

### Minor Changes

- 17760d4: Money-safety fixes across the wallet, ledger, and customer resolution:

  - **`debitBalance` now actually enforces the overspend guarantee.** Stripe does not reject a debit that pushes the customer balance positive (its docstring claimed it does — a positive balance is just owed on the next invoice, which a PAYG site never issues). The debit's `ending_balance` is now checked: an overdraw is reversed and throws `BillingError("insufficient_credits")`. Negative/non-integer `amountCents` (which would silently _credit_ the wallet) throws `RangeError`, and `readBalance` clamps owed amounts to zero.
  - **Ledger balances are numbers again.** `credits_balance` is a Postgres bigint, which `pg` returns as a string; `spendCredits`/`getBillingSummary` were leaking `"90"` into arithmetic and JSON. All read paths coerce to number.
  - **Out-of-order webhook defense.** `recordSubscriptionStatus` accepts the Stripe event's `created` as `eventCreated` and ignores older events, so a delayed `customer.subscription.updated: active` can no longer resurrect a subscription that a later `deleted` event canceled. Requires the new `migrations/0002_billing_status_order.sql`; without `eventCreated` the legacy last-write-wins behavior is unchanged.
  - **Stripe search-query escaping.** `findCustomer` escapes quotes/backslashes in the customer ref before interpolating into the search query — a crafted id could previously alter the query and match another tenant's customer (whose portal `createPortalSession` would then open).
  - **`findOrCreateCustomer` is idempotency-keyed on the ref**, closing the duplicate-customer race that `customers.search`'s eventual consistency (up to ~1 minute stale) makes likely under double-submit.
  - `spendCredits` rejects negative/NaN costs; `refundCredits` accepts an optional `eventId` for idempotent compensation; caller metadata can no longer overwrite the tenant ref tag on checkout sessions; `fetchSubscriptionForCustomer` lists up to 100 subscriptions so an older active subscription isn't missed; the README's broken guide link is replaced with real entitlement/ordering docs.

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
  independently grown across five of our sites.
