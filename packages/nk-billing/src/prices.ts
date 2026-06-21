/**
 * Prices, resolved by stable `lookup_key` rather than hardcoded IDs. The catalog
 * (products/prices) is owned by the infra Pulumi program; this only *consumes*
 * it at runtime. Because a lookup_key resolves to different price IDs in test and
 * live, the same code path works in both modes with nothing mode-specific in env.
 */

import type Stripe from "stripe";
import { getStripe } from "./client.js";

/** Resolve an active Price by its stable lookup_key. `currency_options` is
 *  expanded so callers can see (and localise to) the presentment currencies the
 *  price supports. Throws if no active price carries the key — usually means the
 *  catalog hasn't been applied to this Stripe mode yet. */
export async function priceByLookupKey(
	key: string,
	stripe: Stripe = getStripe(),
): Promise<Stripe.Price> {
	const prices = await stripe.prices.list({
		lookup_keys: [key],
		active: true,
		limit: 1,
		expand: ["data.currency_options"],
	});
	const price = prices.data[0];
	if (!price) {
		throw new Error(
			`No active Stripe price for lookup_key '${key}' — has the catalog been applied to this mode?`,
		);
	}
	return price;
}

/** The presentment currencies a price supports: its base plus currency_options. */
export function supportedCurrencies(price: Stripe.Price): Set<string> {
	return new Set([price.currency, ...Object.keys(price.currency_options ?? {})]);
}

/** The amount (in minor units) a price charges in `currency`, or null if the
 *  price offers neither that currency nor a base amount. Falls back to the base
 *  currency when the requested one isn't carried. Used to display localised
 *  prices without a hardcoded amount. */
export async function displayAmount(
	key: string,
	currency: string,
	stripe: Stripe = getStripe(),
): Promise<{ amount: number; currency: string } | null> {
	const price = await priceByLookupKey(key, stripe);
	if (currency !== price.currency) {
		const opt = price.currency_options?.[currency]?.unit_amount;
		if (opt != null) return { amount: opt, currency };
		// Price doesn't carry that currency — fall through to its base.
	}
	if (price.unit_amount == null) return null;
	return { amount: price.unit_amount, currency: price.currency };
}
