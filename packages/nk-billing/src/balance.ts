/**
 * Customer-balance wallet — Stripe's own credit ledger, for pay-as-you-go sites
 * (domains.ingram.tech). Distinct from the in-app credit ledger in
 * `@ingram-tech/nk-billing/credits`: this stores the balance *in Stripe* as a
 * signed integer (negative = credit available to the customer), so there is no
 * local table to keep in sync. Pick this when the unit you sell is money;
 * pick the credit ledger when the unit is abstract "credits".
 *
 * We normalise Stripe's sign convention to "amount available" (positive cents)
 * so callers never have to remember that a credit is negative.
 */

import type Stripe from "stripe";
import { getStripe } from "./client.js";

export interface Balance {
	/** Credit available to the customer, in minor units (cents). Positive. */
	amount: number;
	currency: string;
}

/** Read a customer's available wallet balance (Stripe's negative credit balance,
 *  sign-flipped to positive). A deleted customer reads as zero. */
export async function readBalance(
	customerId: string,
	stripe: Stripe = getStripe(),
): Promise<Balance> {
	const customer = await stripe.customers.retrieve(customerId);
	if (customer.deleted) return { amount: 0, currency: "eur" };
	return { amount: -customer.balance, currency: customer.currency ?? "eur" };
}

/** Debit the wallet by `amountCents`. Stripe rejects a debit that would push the
 *  balance positive (the customer would owe us), giving a hard over-spend
 *  guarantee with no pre-flight check. Idempotency-keyed by `idempotencyTag` so
 *  retries can't double-debit — tie the tag to the action that triggered the
 *  spend (e.g. the operation's own idempotency key). */
export async function debitBalance(
	opts: {
		customerId: string;
		amountCents: number;
		currency: string;
		description: string;
		idempotencyTag: string;
		metadata?: Record<string, string>;
	},
	stripe: Stripe = getStripe(),
): Promise<void> {
	await stripe.customers.createBalanceTransaction(
		opts.customerId,
		{
			amount: opts.amountCents,
			currency: opts.currency,
			description: opts.description,
			metadata: opts.metadata ?? {},
		},
		{ idempotencyKey: `bal_debit_${opts.idempotencyTag}` },
	);
}
