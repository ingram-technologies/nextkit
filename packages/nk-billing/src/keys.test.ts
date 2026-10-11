import { describe, expect, it } from "vitest";
import { billingEnv, stripeConfigured, stripeModeConfigured } from "./keys.js";

// Every helper takes the env as a parameter, so tests pass one explicitly
// instead of mutating process.env (which leaks across files on a shared worker).
describe("billing env", () => {
	it("is empty (not throwing) when nothing is set", () => {
		expect(billingEnv({})).toEqual({});
		expect(stripeConfigured({})).toBe(false);
		expect(stripeModeConfigured("test", {})).toBe(false);
		expect(stripeModeConfigured("live", {})).toBe(false);
	});

	it("reads the single-mode contract", () => {
		const env = {
			STRIPE_SECRET_KEY: "sk_test_x",
			STRIPE_WEBHOOK_SECRET: "whsec_x",
			STRIPE_API_VERSION: "2025-01-01",
		};
		expect(billingEnv(env)).toMatchObject({
			secretKey: "sk_test_x",
			webhookSecret: "whsec_x",
			apiVersion: "2025-01-01",
		});
		expect(stripeConfigured(env)).toBe(true);
	});

	it("reads the dual-mode contract", () => {
		const env = {
			STRIPE_SECRET_KEY_TEST: "sk_test_x",
			STRIPE_SECRET_KEY_LIVE: "sk_live_x",
		};
		expect(billingEnv(env)).toMatchObject({
			testSecretKey: "sk_test_x",
			liveSecretKey: "sk_live_x",
		});
		expect(stripeModeConfigured("test", env)).toBe(true);
		expect(stripeModeConfigured("live", env)).toBe(true);
		// Single-mode helper stays false — the two contracts are independent.
		expect(stripeConfigured(env)).toBe(false);
	});
});
