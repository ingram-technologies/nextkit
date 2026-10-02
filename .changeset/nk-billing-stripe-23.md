---
"@ingram-tech/nk-billing": minor
---

stripe 23. The SDK's bundled API version moves from `2026-03-25.dahlia` to
`2026-09-30.endive`, so a site that leaves `STRIPE_API_VERSION` unset now talks
to the newer API through `getStripe()`. nk-billing's own calls (checkout,
portal, customers, prices, subscriptions, webhooks) are unaffected. A site
that calls Stripe directly should check the
[23.0.0 changelog](https://github.com/stripe/stripe-node/blob/master/CHANGELOG.md#23-0-0):
notably `payment_method_types` is gone from Checkout Session and
PaymentIntent/SetupIntent create params. Set
`STRIPE_API_VERSION=2026-03-25.dahlia` to stay on the old API version while
migrating.
