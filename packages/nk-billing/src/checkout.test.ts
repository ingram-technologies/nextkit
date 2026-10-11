import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { createCheckoutSession } from "./checkout.js";

const REF = { metadataKey: "acme_org_id", id: "org_1" };

/** The three Stripe surfaces checkout touches; records the session params. */
function recordingStripe() {
	const sessions: Stripe.Checkout.SessionCreateParams[] = [];
	const stripe = {
		customers: {
			search: () => Promise.resolve({ data: [{ id: "cus_1" }] }),
		},
		prices: {
			list: () => Promise.resolve({ data: [{ id: "price_1", currency: "eur" }] }),
		},
		checkout: {
			sessions: {
				create: (params: Stripe.Checkout.SessionCreateParams) => {
					sessions.push(params);
					return Promise.resolve({ url: "https://checkout.test/s" });
				},
			},
		},
	};
	// Structural fake of just the surfaces under test.
	return { sessions, stripe: stripe as unknown as Stripe };
}

const checkout = (
	mode: "subscription" | "payment",
	metadata?: Record<string, string>,
) => ({
	customer: REF,
	lookupKey: "pro_monthly",
	mode,
	successUrl: "https://acme.test/ok",
	cancelUrl: "https://acme.test/cancel",
	metadata,
});

describe("createCheckoutSession", () => {
	it.each(["subscription", "payment"] as const)(
		"%s: the ref tag survives caller metadata that sets the same key",
		async (mode) => {
			const { sessions, stripe } = recordingStripe();
			await createCheckoutSession(
				checkout(mode, { [REF.metadataKey]: "org_other", campaign: "spring" }),
				stripe,
			);
			const params = sessions[0];
			// The webhook resolves the tenant from this tag: a caller must not be
			// able to point the purchase at another tenant.
			expect(params?.metadata?.[REF.metadataKey]).toBe(REF.id);
			expect(params?.metadata?.campaign).toBe("spring");
		},
	);

	it("stamps the tag on the subscription in subscription mode", async () => {
		const { sessions, stripe } = recordingStripe();
		await createCheckoutSession(checkout("subscription"), stripe);
		expect(sessions[0]?.subscription_data?.metadata?.[REF.metadataKey]).toBe(
			REF.id,
		);
	});

	it("sends no subscription_data in payment mode", async () => {
		// Stripe rejects subscription_data on a one-time payment session.
		const { sessions, stripe } = recordingStripe();
		await createCheckoutSession(checkout("payment"), stripe);
		expect(sessions[0]?.subscription_data).toBeUndefined();
	});
});
