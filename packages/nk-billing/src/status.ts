/**
 * Subscription-status predicates with **zero dependencies** — no Stripe SDK, no
 * database. Lives apart from `subscription.ts` (which needs the Stripe client) so
 * the Postgres credit ledger in `./credits` can import the entitlement set
 * without dragging Stripe into that bundle.
 */

/** Stripe statuses that count as "has access" for gating. `past_due` is included
 *  deliberately — the customer keeps access during Stripe's dunning retries. */
export const ACTIVE_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set([
	"active",
	"trialing",
	"past_due",
]);

/** Whether a raw Stripe status grants access. */
export function isActiveStatus(status: string | null | undefined): boolean {
	return status != null && ACTIVE_SUBSCRIPTION_STATUSES.has(status);
}
