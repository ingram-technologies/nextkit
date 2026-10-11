/**
 * Environment contract for @ingram-tech/nk-forms.
 *
 * BOT_PROTECTION_SECRET — secret used to HMAC-sign the timing token so bots
 * can't forge a "this form was rendered long enough ago" claim. Generate with
 * e.g. `openssl rand -hex 32`.
 *
 * Rotation: a comma-separated list is accepted — tokens are signed with the
 * FIRST secret and verified against ALL of them, so `new,old` rotates without
 * invalidating up-to-an-hour-old in-flight forms (which would silently drop
 * every open form's submission).
 */

const parse = (raw: string): string[] =>
	raw
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);

/** The signing secret (first of the list). */
export const getSecret = (): string => {
	const secret = getSecrets()[0];
	if (!secret) {
		throw new Error(
			"@ingram-tech/nk-forms: BOT_PROTECTION_SECRET is not configured",
		);
	}
	return secret;
};

/** All accepted verification secrets, newest first. */
export const getSecrets = (): string[] =>
	parse(process.env.BOT_PROTECTION_SECRET ?? "");

/**
 * Whether the signed-timing layer is configured. Judged on the parsed list, not
 * the raw string: a value with no actual secret in it (`","`) must disable the
 * layer like an unset one, not leave it on with nothing to sign or verify with.
 */
export const isConfigured = (): boolean => getSecrets().length > 0;
