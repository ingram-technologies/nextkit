/**
 * Checkout & Customer Portal sessions — the two hosted Stripe flows every
 * self-serve site uses. {@link createCheckoutSession} covers both a recurring
 * subscription (`mode: "subscription"`) and a one-time purchase such as a credit
 * pack (`mode: "payment"`); {@link createPortalSession} opens the management
 * portal.
 */

import type Stripe from "stripe";
import { getStripe } from "./client.js";
import {
	type CustomerDetails,
	type CustomerRef,
	findOrCreateCustomer,
} from "./customers.js";
import { priceByLookupKey, supportedCurrencies } from "./prices.js";

export interface CheckoutOptions {
	/** Identifies (and, if needed, creates) the Stripe customer. */
	customer: CustomerRef;
	/** Details used only when the customer is created on this call. */
	customerDetails?: CustomerDetails;
	/** Stable price lookup_key for the line item. */
	lookupKey: string;
	/** "subscription" for a recurring plan, "payment" for a one-time purchase. */
	mode: "subscription" | "payment";
	successUrl: string;
	cancelUrl: string;
	/** Line-item quantity (e.g. number of credit packs). Default 1. */
	quantity?: number;
	/** Presentment currency; applied only when the price actually offers it,
	 *  otherwise the price's base currency is used. */
	currency?: string;
	/** Whether to let customers enter promo codes. Default true. */
	allowPromotionCodes?: boolean;
	/** Collect a tax id (e.g. EU VAT) at checkout. The customer must already have
	 *  a billing address — see {@link customerHasBillingAddress}. Default false. */
	collectTaxId?: boolean;
	/** Stripe Checkout locale (e.g. "fr", "nl", "auto"). Default "auto". */
	locale?: Stripe.Checkout.SessionCreateParams["locale"];
	/** Extra metadata to stamp on the session (and, in subscription mode, the
	 *  subscription) — merged with the customer ref tag. */
	metadata?: Record<string, string>;
}

/** Create a Checkout Session and return its URL. The session is created in the
 *  caller's currency when the price supports it (Stripe picks the
 *  currency_options amount), else in the price's base currency. The customer ref
 *  tag is stamped on the session and — in subscription mode — on the subscription
 *  too, so `customer.subscription.*` webhooks carry it without a round-trip. */
export async function createCheckoutSession(
	opts: CheckoutOptions,
	stripe: Stripe = getStripe(),
): Promise<string> {
	const [customer, price] = await Promise.all([
		findOrCreateCustomer(opts.customer, opts.customerDetails, stripe),
		priceByLookupKey(opts.lookupKey, stripe),
	]);

	const currency =
		opts.currency && supportedCurrencies(price).has(opts.currency)
			? opts.currency
			: undefined;

	// The ref tag is spread last: the webhook side resolves the tenant from it,
	// so caller metadata must never be able to overwrite it.
	const metadata = {
		...opts.metadata,
		[opts.customer.metadataKey]: opts.customer.id,
	};

	const session = await stripe.checkout.sessions.create({
		mode: opts.mode,
		customer: customer.id,
		line_items: [{ price: price.id, quantity: opts.quantity ?? 1 }],
		allow_promotion_codes: opts.allowPromotionCodes ?? true,
		locale: opts.locale ?? "auto",
		...(currency ? { currency } : {}),
		...(opts.collectTaxId
			? {
					tax_id_collection: { enabled: true },
					customer_update: { name: "auto" },
				}
			: {}),
		success_url: opts.successUrl,
		cancel_url: opts.cancelUrl,
		metadata,
		...(opts.mode === "subscription" ? { subscription_data: { metadata } } : {}),
	});

	if (!session.url) throw new Error("Stripe did not return a checkout URL");
	return session.url;
}

/** Open a Customer Portal session for managing/cancelling a subscription. */
export async function createPortalSession(
	opts: {
		customer: CustomerRef;
		customerDetails?: CustomerDetails;
		returnUrl: string;
	},
	stripe: Stripe = getStripe(),
): Promise<string> {
	const customer = await findOrCreateCustomer(
		opts.customer,
		opts.customerDetails,
		stripe,
	);
	const session = await stripe.billingPortal.sessions.create({
		customer: customer.id,
		return_url: opts.returnUrl,
	});
	return session.url;
}
