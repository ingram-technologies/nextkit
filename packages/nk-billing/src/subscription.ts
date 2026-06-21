/**
 * Subscription status — the normalisation every site repeats, in one place.
 *
 * Two things are awkward about Stripe subscriptions and handled here: (1) which
 * raw statuses count as "entitled" (you stay entitled through `past_due` while
 * Stripe retries the card), and (2) the billing period now lives on the
 * subscription *item* (`current_period_end`), not the subscription, in current
 * API versions. {@link summarizeSubscription} flattens a raw subscription into
 * the handful of fields a site actually persists/displays.
 */

import type Stripe from "stripe";
import { getStripe } from "./client.js";
import { isActiveStatus } from "./status.js";

export { ACTIVE_SUBSCRIPTION_STATUSES, isActiveStatus } from "./status.js";

/** The flattened view of a subscription a site persists or displays. Epoch fields
 *  are JS `Date`s (Stripe returns Unix seconds). */
export interface SubscriptionSummary {
	subscriptionId: string;
	customerId: string;
	status: string;
	active: boolean;
	priceId: string | null;
	/** End of the current billing period (from the subscription item). */
	currentPeriodEnd: Date | null;
	cancelAtPeriodEnd: boolean;
	trialEnd: Date | null;
}

const toDate = (seconds: number | null | undefined): Date | null =>
	seconds == null ? null : new Date(seconds * 1000);

/** Flatten a raw Stripe subscription into a {@link SubscriptionSummary}. */
export function summarizeSubscription(sub: Stripe.Subscription): SubscriptionSummary {
	const item = sub.items.data[0];
	return {
		subscriptionId: sub.id,
		customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
		status: sub.status,
		active: isActiveStatus(sub.status),
		priceId: item?.price.id ?? null,
		currentPeriodEnd: toDate(item?.current_period_end),
		cancelAtPeriodEnd: sub.cancel_at_period_end,
		trialEnd: toDate(sub.trial_end),
	};
}

/** Read a customer's most relevant subscription live from Stripe — the first
 *  active one if any, else the most recent. Returns null when the customer has
 *  none. Use to back the "webhook lag self-heal" pattern: when your cache says
 *  not-active, re-check here and backfill the row. */
export async function fetchSubscriptionForCustomer(
	customerId: string,
	stripe: Stripe = getStripe(),
): Promise<Stripe.Subscription | null> {
	const subs = await stripe.subscriptions.list({
		customer: customerId,
		status: "all",
		limit: 10,
		expand: ["data.items.data.price"],
	});
	return subs.data.find((s) => isActiveStatus(s.status)) ?? subs.data[0] ?? null;
}

/** {@link fetchSubscriptionForCustomer} flattened to a {@link SubscriptionSummary}. */
export async function fetchSubscriptionSummary(
	customerId: string,
	stripe: Stripe = getStripe(),
): Promise<SubscriptionSummary | null> {
	const sub = await fetchSubscriptionForCustomer(customerId, stripe);
	return sub ? summarizeSubscription(sub) : null;
}
