/**
 * Environment contract for @ingram-tech/bot-protection.
 *
 * BOT_PROTECTION_SECRET — secret used to HMAC-sign the timing token so bots
 * can't forge a "this form was rendered long enough ago" claim. Generate with
 * e.g. `openssl rand -hex 32`.
 */

export const getSecret = (): string => {
	const secret = process.env.BOT_PROTECTION_SECRET;
	if (!secret) {
		throw new Error(
			"@ingram-tech/bot-protection: BOT_PROTECTION_SECRET is not configured",
		);
	}
	return secret;
};

/** Whether the signed-timing layer is configured. */
export const isConfigured = (): boolean => Boolean(process.env.BOT_PROTECTION_SECRET);
