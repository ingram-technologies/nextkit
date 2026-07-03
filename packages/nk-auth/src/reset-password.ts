/**
 * Headless controller for a "set / reset your password" page — the token
 * consumer at the end of Better Auth's forget-password round trip. nk-auth owns
 * the *sender* (`makeEmailSenders.sendResetPassword`) and the endpoint contract;
 * this closes the loop so a site never touches the `resetPassword` endpoint name
 * or hand-rolls the invalid-token / success / validation state machine. The site
 * brings its own shell (inputs, buttons, i18n) and wires it to what this returns.
 *
 * The same page serves both entry points, because both land on the identical URL
 * with a `?token=`: the classic "I forgot my password" flow, and "set a password
 * for my social-only account" (Better Auth's reset endpoint creates the
 * credential when the user has none — see the package README).
 *
 *   "use client";
 *   const { status, error, submit } = useResetPassword(authClient, { token });
 *   if (status === "invalid") return <InvalidLink />;
 *   if (status === "success") return <Done />;
 *   // <form onSubmit={() => submit(pw, confirm)}> … {error && t(error.code)} …
 */
import { useCallback, useState } from "react";
import {
	type PasswordPolicy,
	type ResetPasswordError,
	validateNewPassword,
} from "./password.js";

export type ResetPasswordStatus =
	/** No usable token in the URL — show an "invalid or expired link" message. */
	| "invalid"
	/** Token present; awaiting the user's new password. */
	| "idle"
	/** The reset request is in flight. */
	| "submitting"
	/** The password was set; the user can now sign in with it. */
	| "success"
	/** Validation failed, or the server rejected the reset — see `error`. */
	| "error";

/** The slice of a Better Auth client this hook calls. */
export interface ResetPasswordClient {
	resetPassword: (input: {
		newPassword: string;
		token: string;
	}) => Promise<{ error?: { message?: string } | null }>;
}

export interface UseResetPasswordOptions extends PasswordPolicy {
	/**
	 * The reset token from the URL (`?token=`), or null when it is missing — e.g.
	 * the link carried `?error=INVALID_TOKEN` instead. Null puts the controller in
	 * the `invalid` state before any submit.
	 */
	token: string | null;
}

export interface UseResetPassword {
	status: ResetPasswordStatus;
	/** The current failure, or null. `code` is stable for i18n; `message` is an English fallback. */
	error: ResetPasswordError | null;
	/** Validate the pair against the policy, then call the reset endpoint. */
	submit: (newPassword: string, confirmPassword: string) => Promise<void>;
}

const RESET_FAILED_FALLBACK = "Could not reset your password.";

/**
 * Drive a reset-password form. Returns the current `status`, the last `error`
 * (with an i18n-friendly `code`), and a `submit(newPassword, confirmPassword)`
 * that runs {@link validateNewPassword} against the policy before hitting the
 * server. Pass the resolved `minLength` / `maxLength` when the site overrides
 * Better Auth's defaults so client and server agree.
 */
export function useResetPassword(
	client: ResetPasswordClient,
	options: UseResetPasswordOptions,
): UseResetPassword {
	const { token, minLength, maxLength } = options;
	const [status, setStatus] = useState<ResetPasswordStatus>(
		token ? "idle" : "invalid",
	);
	const [error, setError] = useState<ResetPasswordError | null>(null);

	const submit = useCallback(
		async (newPassword: string, confirmPassword: string): Promise<void> => {
			if (!token) {
				setStatus("invalid");
				return;
			}

			const validation = validateNewPassword(newPassword, confirmPassword, {
				minLength,
				maxLength,
			});
			if (validation) {
				setError(validation);
				setStatus("error");
				return;
			}

			setError(null);
			setStatus("submitting");
			try {
				const { error: resetError } = await client.resetPassword({
					newPassword,
					token,
				});
				if (resetError) {
					setError({
						code: "reset_failed",
						message: resetError.message ?? RESET_FAILED_FALLBACK,
					});
					setStatus("error");
					return;
				}
				setStatus("success");
			} catch (err) {
				setError({
					code: "reset_failed",
					message: err instanceof Error ? err.message : RESET_FAILED_FALLBACK,
				});
				setStatus("error");
			}
		},
		[token, minLength, maxLength, client],
	);

	return { status, error, submit };
}
