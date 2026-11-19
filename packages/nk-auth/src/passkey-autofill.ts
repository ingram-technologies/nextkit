/**
 * Passkey sign-in through the browser's own autofill ("conditional UI"). The
 * request waits until the user picks a passkey from the username field's
 * dropdown, where iCloud Keychain, Google Password Manager, 1Password and
 * Bitwarden list them; anyone without one types as usual. No button, nothing
 * to dismiss.
 *
 * Two halves, both required: the field opts in with an `autocomplete` that
 * ends in `webauthn`, and the page arms the request on mount.
 *
 *   "use client";
 *   usePasskeyAutofill(authClient, {
 *     rpId: "example.com",
 *     onSignIn: () => router.push("/dashboard"),
 *   });
 *   <input type="email" name="email" autoComplete={PASSKEY_AUTOFILL_EMAIL} />
 */
import { useEffect, useRef } from "react";

/**
 * `autocomplete` for an email field that also offers passkeys. `webauthn` is a
 * real token (WebAuthn Level 3, in the HTML autofill spec); without it the
 * armed request never surfaces. Exported as a constant partly because some
 * jsx-a11y `autocomplete-valid` implementations predate the token.
 */
export const PASSKEY_AUTOFILL_EMAIL = "email webauthn";
/** As {@link PASSKEY_AUTOFILL_EMAIL}, for a username field. */
export const PASSKEY_AUTOFILL_USERNAME = "username webauthn";

/** The slice of a Better Auth client (with `passkeyClient()`) this hook calls. */
export interface PasskeyAutofillClient {
	signIn: {
		passkey: (opts?: {
			autoFill?: boolean;
			fetchOptions?: { signal?: AbortSignal };
		}) => Promise<{ data?: unknown; error?: unknown }>;
	};
}

export interface UsePasskeyAutofillOptions {
	/** Runs once a passkey has signed the user in. */
	onSignIn: () => void;
	/**
	 * The relying-party id passkeys are bound to. On any other host (a preview
	 * deployment, localhost) the browser refuses the ceremony, so the hook does
	 * not arm it. Omit to arm everywhere.
	 */
	rpId?: string;
}

/** Whether `hostname` can run a ceremony for `rpId`: the domain itself or a subdomain. */
export function passkeyHostMatches(hostname: string, rpId: string): boolean {
	return hostname === rpId || hostname.endsWith(`.${rpId}`);
}

/**
 * Arm passkey autofill for the lifetime of the calling component. A dismissed
 * or unsupported ceremony is silent: the field keeps working as a plain input.
 */
export function usePasskeyAutofill(
	client: PasskeyAutofillClient,
	{ onSignIn, rpId }: UsePasskeyAutofillOptions,
): void {
	const onSignInRef = useRef(onSignIn);
	useEffect(() => {
		onSignInRef.current = onSignIn;
	}, [onSignIn]);

	useEffect(() => {
		if (rpId && !passkeyHostMatches(window.location.hostname, rpId)) return;
		const controller = new AbortController();
		client.signIn
			.passkey({ autoFill: true, fetchOptions: { signal: controller.signal } })
			.then((result) => {
				if (!result.error && result.data && !controller.signal.aborted) {
					onSignInRef.current();
				}
			})
			.catch(() => {
				// Aborted on unmount, dismissed, or no WebAuthn support: the
				// field is still an ordinary input.
			});
		return () => controller.abort();
	}, [client, rpId]);
}
