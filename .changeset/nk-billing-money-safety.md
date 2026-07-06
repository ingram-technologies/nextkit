---
"@ingram-tech/nk-billing": minor
---

Money-safety fixes across the wallet, ledger, and customer resolution:

- **`debitBalance` now actually enforces the overspend guarantee.** Stripe does not reject a debit that pushes the customer balance positive (its docstring claimed it does — a positive balance is just owed on the next invoice, which a PAYG site never issues). The debit's `ending_balance` is now checked: an overdraw is reversed and throws `BillingError("insufficient_credits")`. Negative/non-integer `amountCents` (which would silently *credit* the wallet) throws `RangeError`, and `readBalance` clamps owed amounts to zero.
- **Ledger balances are numbers again.** `credits_balance` is a Postgres bigint, which `pg` returns as a string; `spendCredits`/`getBillingSummary` were leaking `"90"` into arithmetic and JSON. All read paths coerce to number.
- **Out-of-order webhook defense.** `recordSubscriptionStatus` accepts the Stripe event's `created` as `eventCreated` and ignores older events, so a delayed `customer.subscription.updated: active` can no longer resurrect a subscription that a later `deleted` event canceled. Requires the new `migrations/0002_billing_status_order.sql`; without `eventCreated` the legacy last-write-wins behavior is unchanged.
- **Stripe search-query escaping.** `findCustomer` escapes quotes/backslashes in the customer ref before interpolating into the search query — a crafted id could previously alter the query and match another tenant's customer (whose portal `createPortalSession` would then open).
- **`findOrCreateCustomer` is idempotency-keyed on the ref**, closing the duplicate-customer race that `customers.search`'s eventual consistency (up to ~1 minute stale) makes likely under double-submit.
- `spendCredits` rejects negative/NaN costs; `refundCredits` accepts an optional `eventId` for idempotent compensation; caller metadata can no longer overwrite the tenant ref tag on checkout sessions; `fetchSubscriptionForCustomer` lists up to 100 subscriptions so an older active subscription isn't missed; the README's broken guide link is replaced with real entitlement/ordering docs.
