// Server entry — the Ingram Better Auth foundation. Browser re-exports live at
// "@ingram-tech/nk-auth/client" so importing the server presets never pulls in
// React. Focused subpaths (./jwt, ./organization, ./pool) let a site import
// only what it needs (e.g. avoid bcrypt when it doesn't use passwords).

export { type BackendJwtConfig, backendJwtOptions, verifyBackendJwt } from "./jwt.js";
export { base58Id, fromPrefixedId, toPrefixedId, uuidGenerateId } from "./id.js";
export { type AuthEnv, authEnv, authSecret, isConfigured } from "./keys.js";
export {
	bcryptPassword,
	makeEmailSenders,
	makePasskeyOptions,
	type PasskeyConfig,
	passkeyOptionsForBaseUrl,
	type SendEmail,
} from "./options.js";
export {
	lastActiveOrganizationHooks,
	lastActiveOrganizationUserField,
	nkOrganizationDefaults,
} from "./organization.js";
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
export { authBasePath } from "./paths.js";
export { createAuthPool } from "./pool.js";
