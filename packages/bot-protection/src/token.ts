import { createHmac, timingSafeEqual } from "node:crypto";
import { getSecret } from "./keys";

/**
 * Signed timing token: `<timestamp>.<hmac>`. The timestamp records when the
 * form was rendered; the HMAC (keyed by BOT_PROTECTION_SECRET) prevents a bot
 * from forging an older timestamp to defeat the "submitted too fast" check.
 */

const sign = (ts: string, secret: string): string =>
	createHmac("sha256", secret).update(ts).digest("hex");

/** Mint a token. Call server-side when rendering the form. */
export const createFormToken = (): string => {
	const ts = Date.now().toString();
	return `${ts}.${sign(ts, getSecret())}`;
};

export interface TokenCheck {
	/** Reject submissions faster than this (default 2000ms — bots are instant). */
	minMs?: number;
	/** Reject tokens older than this (default 1h — stale/replayed forms). */
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

	const expected = sign(ts, getSecret());
	const a = Buffer.from(sig);
	const b = Buffer.from(expected);
	if (a.length !== b.length || !timingSafeEqual(a, b)) {
		return { ok: false, reason: "bad-signature" };
	}

	const elapsed = Date.now() - Number(ts);
	if (!Number.isFinite(elapsed)) return { ok: false, reason: "bad-timestamp" };
	if (elapsed < minMs) return { ok: false, reason: "too-fast" };
	if (elapsed > maxMs) return { ok: false, reason: "expired" };

	return { ok: true };
};
