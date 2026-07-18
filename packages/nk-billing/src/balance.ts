/**
 * Customer-balance wallet — Stripe's own credit ledger, for pay-as-you-go
 * sites. Distinct from the in-app credit ledger in
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
import { DEFAULT_CURRENCY } from "./currency.js";
import { BillingError } from "./errors.js";

export interface Balance {
	/** Credit available to the customer, in minor units (cents). Positive. */
	amount: number;
	currency: string;
}

/** Read a customer's available wallet balance (Stripe's negative credit balance,
 *  sign-flipped to positive and clamped at zero — a positive Stripe balance is
 *  an amount owed, not available credit). A deleted customer reads as zero. */
export async function readBalance(
	customerId: string,
	stripe: Stripe = getStripe(),
): Promise<Balance> {
	const customer = await stripe.customers.retrieve(customerId);
	if (customer.deleted) return { amount: 0, currency: DEFAULT_CURRENCY };
	return {
		amount: Math.max(0, -customer.balance),
		currency: customer.currency ?? DEFAULT_CURRENCY,
	};
}

/** Debit the wallet by `amountCents`, throwing {@link BillingError}
 *  (`insufficient_credits`) when the customer's credit doesn't cover it.
 *
 *  Stripe does NOT reject a debit that pushes the balance positive (a positive
 *  balance is simply owed on the next invoice — which a PAYG site never
 *  issues), so the guarantee is enforced here: after the debit we check the
 *  transaction's `ending_balance`, and if the customer would owe money we
 *  reverse the debit and throw. Two concurrent overspends both apply, then
 *  both observe the positive balance and reverse — the wallet converges to its
 *  pre-race state minus at most the covered amount.
 *
 *  Idempotency-keyed by `idempotencyTag` so retries can't double-debit — tie
 *  the tag to the action that triggered the spend (e.g. the operation's own
 *  idempotency key). */
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
	if (!Number.isSafeInteger(opts.amountCents) || opts.amountCents <= 0) {
		// A negative amount would silently *credit* the wallet.
		throw new RangeError(
			`debitBalance amountCents must be a positive integer, got ${opts.amountCents}`,
		);
	}
	const txn = await stripe.customers.createBalanceTransaction(
		opts.customerId,
		{
			amount: opts.amountCents,
			currency: opts.currency,
			description: opts.description,
			metadata: opts.metadata ?? {},
		},
		{ idempotencyKey: `bal_debit_${opts.idempotencyTag}` },
	);
	if (txn.ending_balance > 0) {
		await stripe.customers.createBalanceTransaction(
			opts.customerId,
			{
				amount: -opts.amountCents,
				currency: opts.currency,
				description: `Reversal (insufficient balance): ${opts.description}`,
				metadata: opts.metadata ?? {},
			},
			{ idempotencyKey: `bal_debit_reversal_${opts.idempotencyTag}` },
		);
		throw new BillingError(
			"insufficient_credits",
			"Insufficient balance for this debit.",
		);
	}
}
