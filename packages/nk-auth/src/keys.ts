/**
 * Environment contract for @ingram-tech/nk-auth.
 *
 * Following the "each package owns its own env validation" pattern. Env vars are
 * external input, so we parse them with Zod (per docs/code-style.md) rather than
 * reading `process.env` ad hoc. `authEnv()` returns a validated, config-shaped
 * object you can spread straight into your `betterAuth()` call.
 *
 * Required:
 *   BETTER_AUTH_SECRET  — session/CSRF signing key (`openssl rand -hex 32`)
 *   BETTER_AUTH_URL     — canonical site origin, e.g. "https://example.com"
 *   DATABASE_URL        — direct Postgres connection for Better Auth (:5432)
 *
 * Outside production, BETTER_AUTH_SECRET falls back to a well-known insecure
 * placeholder so local dev and tests run without hand-setting it (`nk dev` and
 * plain `next dev` alike). In production it stays strictly required — a missing
 * secret throws at startup rather than silently signing sessions with a value
 * anyone could guess.
 *
 * Sites that derive their own `baseURL` / database connection can take just the
 * secret's prod/dev rule via `authSecret()` instead of the whole `authEnv()`
 * bundle — so that security-sensitive default is never re-implemented app-side.
 */

import { z } from "zod";

/**
 * Well-known, deliberately insecure secret used ONLY when NODE_ENV is not
 * "production". Never applied to a production build — see `secretField`.
 */
const DEV_SECRET_PLACEHOLDER = "nk-dev-insecure-placeholder-not-for-production";

/**
 * In production the secret is required; everywhere else it defaults to the
 * insecure placeholder. Read NODE_ENV at parse time (not module load) so the
 * same process can be exercised under either mode.
 */
const secretField = () =>
	process.env.NODE_ENV === "production"
		? z.string().min(1)
		: z.string().min(1).default(DEV_SECRET_PLACEHOLDER);

const buildSchema = () =>
	z.object({
		BETTER_AUTH_SECRET: secretField(),
		BETTER_AUTH_URL: z.string().url(),
		DATABASE_URL: z.string().min(1),
	});

let warnedPlaceholder = false;

/**
 * Warn once when the insecure dev placeholder is in use, so a missing secret is
 * visible in local logs without nagging on every call. Never fires in
 * production, where `secretField()` makes the secret required.
 */
const warnIfPlaceholder = (secret: string): void => {
	if (secret === DEV_SECRET_PLACEHOLDER && !warnedPlaceholder) {
		warnedPlaceholder = true;
		console.warn(
			"@ingram-tech/nk-auth: BETTER_AUTH_SECRET is unset — using an insecure dev placeholder. Set it before deploying.",
		);
	}
};

/**
 * Resolve just the session-signing secret, applying the same rule `authEnv()`
 * does: strictly required in production, an insecure dev placeholder otherwise.
 *
 * For sites that derive their own `baseURL` and open their own database
 * connection (so they don't want `authEnv()`'s all-or-nothing bundle) but still
 * want nk-auth to own the secret's prod/dev fallback. Reaching for this keeps
 * the security-sensitive default in one place instead of hand-copied into the
 * app. Backed by the same `secretField()` schema as `authEnv()`.
 */
export const authSecret = (): string => {
	const result = secretField().safeParse(process.env.BETTER_AUTH_SECRET);
	if (!result.success) {
		// secretField() only rejects a missing/empty secret in production (dev
		// supplies the placeholder default), so that is the sole failure here.
		throw new Error(
			"@ingram-tech/nk-auth: BETTER_AUTH_SECRET is required (an unset secret is only allowed outside production)",
		);
	}
	warnIfPlaceholder(result.data);
	return result.data;
};

export interface AuthEnv {
	secret: string;
	baseURL: string;
	databaseUrl: string;
}

/**
 * Read and validate all nk-auth env vars at once. Throws a single error listing
 * everything missing/invalid, so a misconfigured site fails fast at startup
 * rather than at first sign-in.
 */
export const authEnv = (): AuthEnv => {
	const result = buildSchema().safeParse(process.env);
	if (!result.success) {
		const issues = result.error.issues
			.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
			.join(", ");
		throw new Error(`@ingram-tech/nk-auth: invalid environment — ${issues}`);
	}
	const env = result.data;
	warnIfPlaceholder(env.BETTER_AUTH_SECRET);
	return {
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		databaseUrl: env.DATABASE_URL,
	};
};

/** Whether nk-auth is fully configured (lets callers degrade in local/dev). */
export const isConfigured = (): boolean => buildSchema().safeParse(process.env).success;
