import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { debitBalance, readBalance } from "./balance.js";

/** A fake of the two Stripe surfaces the wallet touches. Stripe's real balance
 *  semantics: negative = credit available, positive = owed; a debit ADDS to the
 *  balance and Stripe happily lets it go positive — which is exactly the case
 *  debitBalance must detect and reverse. */
function fakeStripe(startingBalance: number) {
	const state = {
		balance: startingBalance,
		transactions: [] as number[],
		idempotencyKeys: [] as (string | undefined)[],
	};
	const stripe = {
		customers: {
			retrieve: () =>
				Promise.resolve({
					deleted: false,
					balance: state.balance,
					currency: "eur",
				}),
			createBalanceTransaction: (
				_customerId: string,
				params: { amount: number },
				options?: { idempotencyKey?: string },
			) => {
				state.idempotencyKeys.push(options?.idempotencyKey);
				state.balance += params.amount;
				state.transactions.push(params.amount);
				return Promise.resolve({ ending_balance: state.balance });
			},
		},
	};
	// Structural fake of just the surfaces under test; Stripe's client type is
	// not implementable wholesale.
	return { state, stripe: stripe as unknown as Stripe };
}

describe("readBalance", () => {
	it("sign-flips Stripe's credit convention and clamps owed amounts to zero", async () => {
		expect((await readBalance("cus_1", fakeStripe(-500).stripe)).amount).toBe(500);
		// A positive Stripe balance is money owed, not available credit.
		expect((await readBalance("cus_1", fakeStripe(300).stripe)).amount).toBe(0);
	});
});

describe("debitBalance", () => {
	const opts = (amountCents: number) => ({
		customerId: "cus_1",
		amountCents,
		currency: "eur",
		description: "usage",
		idempotencyTag: "op_1",
	});

	it("debits within the available credit", async () => {
		const { state, stripe } = fakeStripe(-500);
		await debitBalance(opts(500), stripe);
		expect(state.balance).toBe(0);
	});

	it("reverses and throws when the debit would overdraw the wallet", async () => {
		const { state, stripe } = fakeStripe(-100);
		await expect(debitBalance(opts(250), stripe)).rejects.toMatchObject({
			name: "BillingError",
			reason: "insufficient_credits",
		});
		// The overdraw was compensated: debit +250, reversal -250.
		expect(state.transactions).toEqual([250, -250]);
		expect(state.balance).toBe(-100);
	});

	it("keys the debit and its reversal apart, deterministically from the tag", async () => {
		const overdraw = async (idempotencyTag: string) => {
			const { state, stripe } = fakeStripe(-100);
			await expect(
				debitBalance({ ...opts(250), idempotencyTag }, stripe),
			).rejects.toThrow();
			return state.idempotencyKeys;
		};
		const [debit, reversal] = await overdraw("op_1");
		// Sharing a key would make Stripe replay the debit as the "reversal".
		expect(debit).toBeTruthy();
		expect(reversal).toBeTruthy();
		expect(debit).not.toBe(reversal);
		// A retry of the same action reuses both keys, so it cannot double-apply.
		expect(await overdraw("op_1")).toEqual([debit, reversal]);
		// A different action gets keys of its own.
		const other = await overdraw("op_2");
		expect(other).not.toContain(debit);
		expect(other).not.toContain(reversal);
	});

	it("rejects zero, negative, and non-integer amounts up front", async () => {
		const { state, stripe } = fakeStripe(-500);
		await expect(debitBalance(opts(0), stripe)).rejects.toThrow(RangeError);
		// A negative amount would silently CREDIT the wallet.
		await expect(debitBalance(opts(-100), stripe)).rejects.toThrow(RangeError);
		await expect(debitBalance(opts(1.5), stripe)).rejects.toThrow(RangeError);
		expect(state.transactions).toEqual([]);
	});
});
