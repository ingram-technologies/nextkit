---
"@ingram-tech/nk-billing": patch
---

Make the webhook credit mutators atomic on a bare pool. `grantCredits`,
`refundCredits` (with an `eventId`), and `recordSubscriptionStatus` previously
issued the `claimStripeEvent` insert and the balance/status write as two separate
statements — atomic only if the caller wrapped them in a transaction, which
`Queryable` (satisfied by a bare `pg.Pool`) does not enforce. A crash between the
two would commit the claim while dropping the mutation, permanently marking the
Stripe event processed with the credits never applied (the retry then no-ops).
Each now folds the claim and the mutation into one `WITH claim AS (…)` statement,
so the pair commits or rolls back together even under autocommit. Behavior is
otherwise unchanged (idempotency, out-of-order status defense, return values).
