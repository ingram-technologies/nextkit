/**
 * Timing-safe HMAC verification for inbound webhooks — the primitive every site
 * re-implements when it adds a `/internal/webhooks/<provider>` route. Providers
 * that sign a raw request body with a shared secret (GitHub's
 * `X-Hub-Signature-256`, a generic `x-…-hmac-sha256`, e-invoice's `X-Signature`,
 * etc.) verify with this; it does a length-checked, constant-time compare so a
 * forged signature can't be probed byte-by-byte via timing.
 *
 * Stripe is the deliberate exception — use the Stripe SDK's `constructEvent`
 * (handled by `@ingram-tech/nk-billing`), which also checks the timestamp.
 *
 * This is the verification step only — it takes the exact bytes the provider
 * signed. Providers that sign a *constructed* string (Slack's `v0:ts:body`) or a
 * canonical re-serialization build that string themselves and pass it as
 * `payload`. Always verify against the **raw** request body, before any JSON
 * round-trip, since re-serialization changes the bytes.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** The result of a signature check. `error` is a short reason when `valid` is false. */
export interface HmacVerificationResult {
	valid: boolean;
	error?: string;
}

/**
 * Verify an HMAC-SHA256 signature over `payload` keyed by `secret`. The
 * `signature` may carry a leading `sha256=` (GitHub-style) prefix, which is
 * stripped. Set `encoding` to match how the provider encodes the digest —
 * `"hex"` (default) or `"base64"`.
 *
 * ```ts
 * const raw = await c.req.text(); // raw body — do NOT re-serialize
 * const { valid } = verifyHmacSha256({
 *   payload: raw,
 *   signature: c.req.header("x-hub-signature-256") ?? "",
 *   secret: env.WEBHOOK_SECRET,
 * });
 * if (!valid) throw new HttpError(401, "Invalid webhook signature");
 * ```
 */
export const verifyHmacSha256 = (params: {
	payload: string | Buffer;
	signature: string;
	secret: string;
	encoding?: "hex" | "base64";
}): HmacVerificationResult => {
	if (!params.signature) return { valid: false, error: "Missing webhook signature" };
	if (!params.secret) return { valid: false, error: "Missing webhook secret" };

	const encoding = params.encoding ?? "hex";
	const provided = params.signature.startsWith("sha256=")
		? params.signature.slice("sha256=".length)
		: params.signature;

	const expected = createHmac("sha256", params.secret)
		.update(params.payload)
		.digest(encoding);

	// Decode both to bytes so the constant-time compare is over fixed-width
	// buffers; a malformed (non-hex/base64) signature yields a length mismatch.
	const providedBuffer = Buffer.from(provided, encoding);
	const expectedBuffer = Buffer.from(expected, encoding);

	if (
		providedBuffer.length !== expectedBuffer.length ||
		!timingSafeEqual(providedBuffer, expectedBuffer)
	) {
		return { valid: false, error: "Invalid webhook signature" };
	}

	return { valid: true };
};
