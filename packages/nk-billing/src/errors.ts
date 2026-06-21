/**
 * The one error type the credit ledger throws when a charge can't proceed.
 * API routes turn it into a 402 Payment Required; server actions / chat map it to
 * a user-facing message. Kept here (not in `credits.ts`) so the error shape can be
 * imported without pulling in the Postgres-facing ledger code.
 */

/** Why a charge was denied. */
export type DenyReason = "not_entitled" | "insufficient_credits";

/** Default user-facing copy for a denial — short, actionable, points at the fix.
 *  Sites can ignore this and write their own from the {@link DenyReason}. */
export function denyMessage(reason: DenyReason): string {
	return reason === "not_entitled"
		? "This workspace needs an active subscription. Subscribe in Settings → Billing."
		: "You're out of credits. Buy a credit pack in Settings → Billing.";
}

/** Thrown by the ledger's `requireCredits` when an entity can't pay for an
 *  action. Carries the machine-readable {@link DenyReason} for status mapping. */
export class BillingError extends Error {
	readonly reason: DenyReason;
	constructor(reason: DenyReason, message: string = denyMessage(reason)) {
		super(message);
		this.name = "BillingError";
		this.reason = reason;
	}
}
