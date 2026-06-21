import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { billingEnv, stripeConfigured, stripeModeConfigured } from "./keys.js";

const KEYS = [
	"STRIPE_SECRET_KEY",
	"STRIPE_WEBHOOK_SECRET",
	"STRIPE_SECRET_KEY_TEST",
	"STRIPE_SECRET_KEY_LIVE",
	"STRIPE_WEBHOOK_SECRET_TEST",
	"STRIPE_WEBHOOK_SECRET_LIVE",
	"STRIPE_API_VERSION",
] as const;

describe("billing env", () => {
	const saved: Record<string, string | undefined> = {};
	beforeEach(() => {
		for (const k of KEYS) {
			saved[k] = process.env[k];
			delete process.env[k];
		}
	});
	afterEach(() => {
		for (const k of KEYS) {
			if (saved[k] === undefined) delete process.env[k];
			else process.env[k] = saved[k];
		}
	});

	it("is empty (not throwing) when nothing is set", () => {
		expect(billingEnv()).toEqual({});
		expect(stripeConfigured()).toBe(false);
		expect(stripeModeConfigured("test")).toBe(false);
		expect(stripeModeConfigured("live")).toBe(false);
	});

	it("reads the single-mode contract", () => {
		process.env.STRIPE_SECRET_KEY = "sk_test_x";
		process.env.STRIPE_WEBHOOK_SECRET = "whsec_x";
		process.env.STRIPE_API_VERSION = "2025-01-01";
		const env = billingEnv();
		expect(env.secretKey).toBe("sk_test_x");
		expect(env.webhookSecret).toBe("whsec_x");
		expect(env.apiVersion).toBe("2025-01-01");
		expect(stripeConfigured()).toBe(true);
	});

	it("reads the dual-mode contract", () => {
		process.env.STRIPE_SECRET_KEY_TEST = "sk_test_x";
		process.env.STRIPE_SECRET_KEY_LIVE = "sk_live_x";
		expect(billingEnv().testSecretKey).toBe("sk_test_x");
		expect(billingEnv().liveSecretKey).toBe("sk_live_x");
		expect(stripeModeConfigured("test")).toBe(true);
		expect(stripeModeConfigured("live")).toBe(true);
		// Single-mode helper stays false — the two contracts are independent.
		expect(stripeConfigured()).toBe(false);
	});
});
