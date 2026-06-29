/**
 * The Stripe client — lazily constructed and memoised so the process (and the
 * test suite) boots without keys, and the SDK is only instantiated on first use.
 *
 * This is the one pattern every Ingram site had hand-rolled identically (the
 * `getStripe()` singleton); it lives here once now. Single-mode sites call
 * {@link getStripe}; a dual-mode site (its own merchant of record, running the
 * Stripe sandbox beside live) calls {@link stripeFor} with a mode and gets one
 * memoised client per mode.
 */

import Stripe from "stripe";
import { billingEnv, type StripeMode } from "./keys.js";

let single: Stripe | null = null;
const byMode: Partial<Record<StripeMode, Stripe>> = {};

function construct(key: string): Stripe {
	const { apiVersion } = billingEnv();
	// Cast: the SDK types apiVersion as a literal union it ships with; we accept
	// any pinned string from the env so a site can pin ahead of an SDK bump.
	const config = apiVersion
		? ({ apiVersion } as ConstructorParameters<typeof Stripe>[1])
		: undefined;
	return new Stripe(key, config);
}

/** The single-mode Stripe client (STRIPE_SECRET_KEY). Throws a clear error if no
 *  key is set — guard read paths with {@link stripeConfigured} when billing is
 *  optional in the environment. */
export function getStripe(): Stripe {
	if (!single) {
		const key = process.env.STRIPE_SECRET_KEY;
		if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
		single = construct(key);
	}
	return single;
}

/** The Stripe client for a dual-mode account (STRIPE_SECRET_KEY_{TEST,LIVE}).
 *  Throws if that mode's key is unset. */
export function stripeFor(mode: StripeMode): Stripe {
	const cached = byMode[mode];
	if (cached) return cached;
	const key =
		mode === "live"
			? process.env.STRIPE_SECRET_KEY_LIVE
			: process.env.STRIPE_SECRET_KEY_TEST;
	if (!key) {
		throw new Error(
			`STRIPE_SECRET_KEY_${mode.toUpperCase()} is not set (dual-mode billing)`,
		);
	}
	const client = construct(key);
	byMode[mode] = client;
	return client;
}

/** Reset the memoised clients. Test-only seam; never call in app code. */
export function resetStripeClients(): void {
	single = null;
	delete byMode.test;
	delete byMode.live;
}
