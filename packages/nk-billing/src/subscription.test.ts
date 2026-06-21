import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { isActiveStatus, summarizeSubscription } from "./subscription.js";

describe("isActiveStatus", () => {
	it("treats active, trialing and past_due as entitled", () => {
		expect(isActiveStatus("active")).toBe(true);
		expect(isActiveStatus("trialing")).toBe(true);
		expect(isActiveStatus("past_due")).toBe(true);
	});
	it("treats everything else (and nullish) as not entitled", () => {
		expect(isActiveStatus("canceled")).toBe(false);
		expect(isActiveStatus("incomplete")).toBe(false);
		expect(isActiveStatus(null)).toBe(false);
		expect(isActiveStatus(undefined)).toBe(false);
	});
});

describe("summarizeSubscription", () => {
	it("flattens the period from the item and converts epochs to Dates", () => {
		const periodEnd = 1_700_000_000;
		const trialEnd = 1_690_000_000;
		const sub = {
			id: "sub_123",
			customer: "cus_123",
			status: "active",
			cancel_at_period_end: true,
			trial_end: trialEnd,
			items: {
				data: [
					{
						price: { id: "price_123" },
						current_period_end: periodEnd,
					},
				],
			},
		} as unknown as Stripe.Subscription;

		const s = summarizeSubscription(sub);
		expect(s).toMatchObject({
			subscriptionId: "sub_123",
			customerId: "cus_123",
			status: "active",
			active: true,
			priceId: "price_123",
			cancelAtPeriodEnd: true,
		});
		expect(s.currentPeriodEnd?.getTime()).toBe(periodEnd * 1000);
		expect(s.trialEnd?.getTime()).toBe(trialEnd * 1000);
	});

	it("resolves the customer id when it's an expanded object", () => {
		const sub = {
			id: "sub_1",
			customer: { id: "cus_obj" },
			status: "canceled",
			cancel_at_period_end: false,
			trial_end: null,
			items: { data: [] },
		} as unknown as Stripe.Subscription;
		const s = summarizeSubscription(sub);
		expect(s.customerId).toBe("cus_obj");
		expect(s.active).toBe(false);
		expect(s.priceId).toBeNull();
		expect(s.currentPeriodEnd).toBeNull();
	});
});
