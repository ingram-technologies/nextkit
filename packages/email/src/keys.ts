/**
 * Environment contract for @ingram-tech/email.
 *
 * Following the "each package owns its own env validation" pattern: this module
 * is the single declaration of which environment variables the email package
 * needs. It is intentionally zero-dependency (no zod) to match the package's
 * self-contained nature — the validation is a few lines of plain TypeScript.
 *
 * Required:
 *   CLOUDFLARE_ACCOUNT_ID      — Cloudflare account that owns the sending domain
 *   CLOUDFLARE_EMAIL_API_TOKEN — API token with Email Sending permission
 *   EMAIL_FROM_DOMAIN          — verified sending domain, e.g. "mail.example.com"
 */

export interface EmailEnv {
	accountId: string;
	apiToken: string;
	fromDomain: string;
}

/**
 * Reads and validates all email-related env vars at once. Throws a single error
 * listing everything that is missing. Call this at startup (or in a healthcheck)
 * to fail fast rather than at first send.
 */
export const keys = (): EmailEnv => {
	const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
	const apiToken = process.env.CLOUDFLARE_EMAIL_API_TOKEN;
	const fromDomain = process.env.EMAIL_FROM_DOMAIN;

	if (!accountId || !apiToken || !fromDomain) {
		const missing: string[] = [];
		if (!accountId) missing.push("CLOUDFLARE_ACCOUNT_ID");
		if (!apiToken) missing.push("CLOUDFLARE_EMAIL_API_TOKEN");
		if (!fromDomain) missing.push("EMAIL_FROM_DOMAIN");
		throw new Error(
			`@ingram-tech/email: missing environment variables: ${missing.join(", ")}`,
		);
	}

	// The combined guard above narrows all three to `string` — no cast needed.
	return { accountId, apiToken, fromDomain };
};

/**
 * Whether the email package is fully configured. Lets callers degrade
 * gracefully (skip sending in local/dev) rather than throw — mirroring the
 * "unconfigured integrations no-op" pattern.
 */
export const isConfigured = (): boolean =>
	Boolean(
		process.env.CLOUDFLARE_ACCOUNT_ID &&
		process.env.CLOUDFLARE_EMAIL_API_TOKEN &&
		process.env.EMAIL_FROM_DOMAIN,
	);
