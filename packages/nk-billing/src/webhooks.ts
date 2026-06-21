/**
 * Webhook verification — the raw-body-read + signature-verify dance every Stripe
 * route repeats. The stateful half (idempotent dedup of an event before applying
 * it) lives in `@ingram-tech/nk-billing/credits` (`claimStripeEvent`), so this
 * module stays free of any database concept.
 */

import type Stripe from "stripe";
import { getStripe } from "./client.js";

/** Result of reading a webhook request: the verified event, or a reason + the
 *  HTTP status to return. 400 = bad/missing signature (don't retry); 503 = the
 *  endpoint isn't configured (secret unset). */
export type WebhookResult =
	| { ok: true; event: Stripe.Event }
	| { ok: false; status: 400 | 503; message: string };

/** Verify a raw body + signature against the signing secret. Thin wrapper over
 *  `stripe.webhooks.constructEvent` that returns a typed result instead of
 *  throwing on a bad signature. */
export function verifyStripeWebhook(
	body: string,
	signature: string | null,
	secret: string,
	stripe: Stripe = getStripe(),
): WebhookResult {
	if (!signature) return { ok: false, status: 400, message: "Missing signature" };
	try {
		const event = stripe.webhooks.constructEvent(body, signature, secret);
		return { ok: true, event };
	} catch {
		return { ok: false, status: 400, message: "Invalid signature" };
	}
}

/** Read and verify a Stripe webhook from a Fetch `Request` — reads the raw text
 *  body (required before any JSON parsing), pulls the `stripe-signature` header,
 *  and verifies. Pass the secret for the relevant mode. Returns a 503 result when
 *  `secret` is empty so an unconfigured endpoint fails closed without throwing.
 *
 * Typical route:
 *   const res = await readStripeWebhook(request, process.env.STRIPE_WEBHOOK_SECRET ?? "");
 *   if (!res.ok) return new Response(res.message, { status: res.status });
 *   // ... dedupe with claimStripeEvent, then handle res.event ...
 */
export async function readStripeWebhook(
	request: Request,
	secret: string,
	stripe: Stripe = getStripe(),
): Promise<WebhookResult> {
	if (!secret) {
		return { ok: false, status: 503, message: "Webhook not configured" };
	}
	const body = await request.text();
	const signature = request.headers.get("stripe-signature");
	return verifyStripeWebhook(body, signature, secret, stripe);
}
