/**
 * Environment contract for @ingram-tech/nk-billing.
 *
 * Following the "each package owns its own env validation" pattern (see
 * @ingram-tech/nk-db and @ingram-tech/nk-auth). Env vars are external input, so
 * we parse them with Zod (per docs/code-style.md) rather than reading
 * `process.env` ad hoc.
 *
 * Two deployment shapes are supported, picked per call site, never both at once:
 *
 *   1. Single-mode (the default for most sites): one account, one key.
 *      `getStripe()` reads STRIPE_SECRET_KEY and `webhookSecret()` reads
 *      STRIPE_WEBHOOK_SECRET.
 *
 *   2. Dual-mode (a site that is its own merchant of record and runs the Stripe
 *      sandbox beside live): `stripeFor("test"|"live")` reads
 *      STRIPE_SECRET_KEY_{TEST,LIVE} and `webhookSecret(mode)` reads
 *      STRIPE_WEBHOOK_SECRET_{TEST,LIVE}.
 *
 * Nothing here hardcodes a price ID. Prices are resolved at runtime by their
 * stable Stripe `lookup_key` (set on the Price out of band, e.g. in your IaC), so
 * the same key resolves in test and live even though their price IDs differ.
 */

import { z } from "zod";

/** Which Stripe account a dual-mode site is talking to. */
export type StripeMode = "test" | "live";

const schema = z.object({
	// Single-mode.
	STRIPE_SECRET_KEY: z.string().min(1).optional(),
	STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
	// Dual-mode.
	STRIPE_SECRET_KEY_TEST: z.string().min(1).optional(),
	STRIPE_SECRET_KEY_LIVE: z.string().min(1).optional(),
	STRIPE_WEBHOOK_SECRET_TEST: z.string().min(1).optional(),
	STRIPE_WEBHOOK_SECRET_LIVE: z.string().min(1).optional(),
	// Optional pin; omitted → the stripe SDK's bundled API version.
	STRIPE_API_VERSION: z.string().min(1).optional(),
});

export interface BillingEnv {
	secretKey?: string;
	webhookSecret?: string;
	testSecretKey?: string;
	liveSecretKey?: string;
	testWebhookSecret?: string;
	liveWebhookSecret?: string;
	apiVersion?: string;
}

/** Read and validate the billing env vars at once. Every field is optional —
 *  billing degrades gracefully when unconfigured (see {@link stripeConfigured})
 *  rather than throwing at import time. */
export const billingEnv = (env: NodeJS.ProcessEnv = process.env): BillingEnv => {
	const result = schema.safeParse(env);
	if (!result.success) {
		const issues = result.error.issues
			.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
			.join(", ");
		throw new Error(`@ingram-tech/nk-billing: invalid environment — ${issues}`);
	}
	const d = result.data;
	return {
		secretKey: d.STRIPE_SECRET_KEY,
		webhookSecret: d.STRIPE_WEBHOOK_SECRET,
		testSecretKey: d.STRIPE_SECRET_KEY_TEST,
		liveSecretKey: d.STRIPE_SECRET_KEY_LIVE,
		testWebhookSecret: d.STRIPE_WEBHOOK_SECRET_TEST,
		liveWebhookSecret: d.STRIPE_WEBHOOK_SECRET_LIVE,
		apiVersion: d.STRIPE_API_VERSION,
	};
};

/** Whether single-mode billing is configured (the secret key is present). Use to
 *  open dev/local flows when no key is set, e.g. a no-op paywall. */
export const stripeConfigured = (env: NodeJS.ProcessEnv = process.env): boolean =>
	Boolean(env.STRIPE_SECRET_KEY);

/** Whether the given dual-mode account is configured. */
export const stripeModeConfigured = (
	mode: StripeMode,
	env: NodeJS.ProcessEnv = process.env,
): boolean =>
	Boolean(mode === "live" ? env.STRIPE_SECRET_KEY_LIVE : env.STRIPE_SECRET_KEY_TEST);
