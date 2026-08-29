import { createHmac, timingSafeEqual } from "node:crypto";
import { getSecret, getSecrets, isConfigured } from "../keys.js";

/**
 * Signed timing token: `<timestamp>.<hmac>`. The timestamp records when the
 * form was rendered; the HMAC (keyed by BOT_PROTECTION_SECRET) prevents a bot
 * from forging an older timestamp to defeat the "submitted too fast" check.
 *
 * Scope: this is a *timing window* gate, not a per-submission nonce. A token is
 * valid for any number of submissions between `minMs` and `maxMs` after it was
 * minted, so it does not by itself prevent replay within that window — it raises
 * the cost (a bot must fetch a real form and wait) and composes with the
 * honeypot and Vercel BotID layers. If you need true single-use semantics, bind
 * the token to a server-stored, one-time value (e.g. a session/CSRF nonce).
 */

const sign = (ts: string, secret: string): string =>
	createHmac("sha256", secret).update(ts).digest("hex");

// Warn at most once: createFormToken runs on every form render, so an
// unconfigured secret would otherwise spam the logs on every request.
let warnedUnconfigured = false;

/**
 * Mint a token. Call server-side when rendering the form. If
 * BOT_PROTECTION_SECRET isn't configured, returns "" (the timing layer is
 * disabled) rather than throwing, so a misconfigured site still works.
 */
export const createFormToken = (): string => {
	if (!isConfigured()) {
		if (!warnedUnconfigured) {
			warnedUnconfigured = true;
			console.warn(
				"@ingram-tech/nk-forms: BOT_PROTECTION_SECRET not set — timing token disabled.",
			);
		}
		return "";
	}
	const ts = Date.now().toString();
	return `${ts}.${sign(ts, getSecret())}`;
};

export interface TokenCheck {
	/** Reject submissions faster than this (default 2000ms — bots are instant). */
	minMs?: number;
	/** Reject tokens older than this (default 1h — bounds the replay window). */
	maxMs?: number;
}

export interface TokenResult {
	ok: boolean;
	reason?: string;
}

/** Verify a token's signature and that it falls inside the timing window. */
export const verifyFormToken = (
	token: string | undefined | null,
	{ minMs = 2000, maxMs = 60 * 60 * 1000 }: TokenCheck = {},
): TokenResult => {
	if (!token) return { ok: false, reason: "missing-token" };

	const dot = token.indexOf(".");
	if (dot <= 0) return { ok: false, reason: "malformed-token" };
	const ts = token.slice(0, dot);
	const sig = token.slice(dot + 1);

	// Verify against every configured secret (signing uses the first) so a
	// rotation doesn't invalidate in-flight forms. Every candidate is compared
	// timing-safely; the count of secrets is not attacker-relevant.
	const a = Buffer.from(sig);
	const valid = getSecrets().some((secret) => {
		const b = Buffer.from(sign(ts, secret));
		return a.length === b.length && timingSafeEqual(a, b);
	});
	if (!valid) {
		return { ok: false, reason: "bad-signature" };
	}

	const elapsed = Date.now() - Number(ts);
	if (!Number.isFinite(elapsed)) return { ok: false, reason: "bad-timestamp" };
	if (elapsed < minMs) return { ok: false, reason: "too-fast" };
	if (elapsed > maxMs) return { ok: false, reason: "expired" };

	return { ok: true };
};
