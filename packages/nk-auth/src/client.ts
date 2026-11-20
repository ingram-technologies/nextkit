/**
 * Browser auth re-exports, at "@ingram-tech/nk-auth/client" so the server entry
 * never pulls in React. A site builds its own client to preserve full plugin
 * type inference:
 *
 *   "use client";
 *   import { createAuthClient, jwtClient } from "@ingram-tech/nk-auth/client";
 *   import { passkeyClient } from "@ingram-tech/nk-auth/client/passkey";
 *
 *   export const authClient = createAuthClient({
 *     baseURL: process.env.NEXT_PUBLIC_SITE_URL,
 *     plugins: [jwtClient(), passkeyClient()],
 *   });
 *
 * This exposes the client auth call surface:
 *   signUp.email / signIn.email / signIn.social / signOut / useSession,
 *   plus passkey.* (register / authenticate) with the passkey plugin.
 *
 * Nothing here imports an optional peer: `passkeyClient` lives at
 * "./client/passkey" so a site without `@better-auth/passkey` still builds.
 */
export { jwtClient } from "better-auth/client/plugins";
export { createAuthClient } from "better-auth/react";
// Password-policy primitives (pure), so a reset form validates against the same
// bounds the server enforces without a second import.
export {
	CREDENTIAL_PROVIDER_ID,
	DEFAULT_MAX_PASSWORD_LENGTH,
	DEFAULT_MIN_PASSWORD_LENGTH,
	type PasswordPolicy,
	passwordSchema,
	type ResetPasswordError,
	type ResetPasswordErrorCode,
	validateNewPassword,
} from "./password.js";
// Re-exported here too so the client can set `basePath` without a server import.
export { authBasePath } from "./paths.js";
// Headless reset-/set-password controller (React hook); the site brings the shell.
export {
	type ResetPasswordClient,
	type ResetPasswordStatus,
	type UseResetPassword,
	type UseResetPasswordOptions,
	useResetPassword,
} from "./reset-password.js";
// Passkey sign-in through the username field's autofill dropdown.
export {
	PASSKEY_AUTOFILL_EMAIL,
	PASSKEY_AUTOFILL_USERNAME,
	type PasskeyAutofillClient,
	passkeyHostMatches,
	type UsePasskeyAutofillOptions,
	usePasskeyAutofill,
} from "./passkey-autofill.js";
// Authenticator-app enrolment: QR, otpauth link and grouped key from a totpURI.
export { type TotpEnrollment, totpEnrollment } from "./totp.js";
