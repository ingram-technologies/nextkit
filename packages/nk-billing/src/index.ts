// The Ingram billing foundation. The stateless Stripe primitives are the main
// entry; the Postgres credit ledger + event-dedup store live behind the
// "@ingram-tech/nk-billing/credits" subpath so a site that only does
// subscriptions or a Stripe-side wallet never imports a database concept.

export {
	type BillingEnv,
	billingEnv,
	type StripeMode,
	stripeConfigured,
	stripeModeConfigured,
} from "./keys.js";
export { getStripe, resetStripeClients, stripeFor } from "./client.js";
export {
	type CustomerDetails,
	type CustomerRef,
	customerHasBillingAddress,
	findCustomer,
	findOrCreateCustomer,
	updateCustomerBillingAddress,
} from "./customers.js";
export { displayAmount, priceByLookupKey, supportedCurrencies } from "./prices.js";
export {
	type BillingCurrency,
	currencyForCountry,
	DEFAULT_CURRENCY,
	EUR_COUNTRIES,
	formatAmount,
	resolveCurrencyFromHeaders,
} from "./currency.js";
export {
	type CheckoutOptions,
	createCheckoutSession,
	createPortalSession,
} from "./checkout.js";
export {
	ACTIVE_SUBSCRIPTION_STATUSES,
	fetchSubscriptionForCustomer,
	fetchSubscriptionSummary,
	isActiveStatus,
	type SubscriptionSummary,
	summarizeSubscription,
} from "./subscription.js";
export {
	readStripeWebhook,
	verifyStripeWebhook,
	type WebhookResult,
} from "./webhooks.js";
export { type Balance, debitBalance, readBalance } from "./balance.js";
export { BillingError, type DenyReason, denyMessage } from "./errors.js";
