/**
 * Password-policy primitives, shared by both ends of a site so the client form
 * and the server validate against the *same* numbers. Pure (no `next`, `react`,
 * or server imports) so it resolves identically from "@ingram-tech/nk-auth" and
 * "@ingram-tech/nk-auth/client". Import from the "./password" subpath.
 *
 * The values mirror Better Auth's `emailAndPassword` defaults; if a site
 * overrides `minPasswordLength` / `maxPasswordLength` in its `betterAuth()`
 * config, pass the same numbers to `passwordSchema()` so the two stay in step.
 */
import { z } from "zod";

/**
 * The Better Auth `account.providerId` value for an email/password credential
 * (as opposed to a social provider like "google"). This is Better Auth's own
 * table shape, not ours — centralised here so no consuming site hard-codes the
 * string. See {@link import("./server.js").createAuthHelpers}'s
 * `hasCredentialAccount`.
 */
export const CREDENTIAL_PROVIDER_ID = "credential";

/** Better Auth's default `emailAndPassword.minPasswordLength`. */
export const DEFAULT_MIN_PASSWORD_LENGTH = 8;

/** Better Auth's default `emailAndPassword.maxPasswordLength`. */
export const DEFAULT_MAX_PASSWORD_LENGTH = 128;

export interface PasswordPolicy {
	/** Minimum length. Default {@link DEFAULT_MIN_PASSWORD_LENGTH}. */
	minLength?: number;
	/** Maximum length. Default {@link DEFAULT_MAX_PASSWORD_LENGTH}. */
	maxLength?: number;
}

/**
 * A Zod schema for a new password, honouring the resolved policy. Use it on both
 * the client (form validation) and the server (before calling Better Auth) so
 * neither side drifts from the other or from the instance's configured bounds.
 */
export function passwordSchema(policy: PasswordPolicy = {}): z.ZodString {
	const min = policy.minLength ?? DEFAULT_MIN_PASSWORD_LENGTH;
	const max = policy.maxLength ?? DEFAULT_MAX_PASSWORD_LENGTH;
	return z
		.string()
		.min(min, `Password must be at least ${min} characters.`)
		.max(max, `Password must be at most ${max} characters.`);
}

/**
 * The failure reasons of a "choose a new password + confirm it" form, as a
 * stable `code` (switch on it for i18n) plus an English `message` fallback.
 * `reset_failed` is the server rejecting the reset token (invalid / expired).
 */
export type ResetPasswordErrorCode =
	| "password_too_short"
	| "password_too_long"
	| "passwords_do_not_match"
	| "reset_failed";

export interface ResetPasswordError {
	code: ResetPasswordErrorCode;
	message: string;
	/** Present on `password_too_short`. */
	minLength?: number;
	/** Present on `password_too_long`. */
	maxLength?: number;
}

/**
 * Validate a new-password pair (the field and its confirmation) against the
 * policy. Returns the first {@link ResetPasswordError}, or null when valid. Pure
 * so it is unit-testable and reusable outside React; {@link
 * import("./client.js").useResetPassword} calls it before hitting the server.
 */
export function validateNewPassword(
	newPassword: string,
	confirmPassword: string,
	policy: PasswordPolicy = {},
): ResetPasswordError | null {
	const min = policy.minLength ?? DEFAULT_MIN_PASSWORD_LENGTH;
	const max = policy.maxLength ?? DEFAULT_MAX_PASSWORD_LENGTH;
	if (newPassword.length < min) {
		return {
			code: "password_too_short",
			message: `Password must be at least ${min} characters.`,
			minLength: min,
		};
	}
	if (newPassword.length > max) {
		return {
			code: "password_too_long",
			message: `Password must be at most ${max} characters.`,
			maxLength: max,
		};
	}
	if (newPassword !== confirmPassword) {
		return {
			code: "passwords_do_not_match",
			message: "Passwords do not match.",
		};
	}
	return null;
}
