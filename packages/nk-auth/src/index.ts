// Server entry — the Ingram Better Auth foundation. Browser re-exports live at
// "@ingram-tech/nk-auth/client" so importing the server presets never pulls in
// React. Focused subpaths (./jwt, ./organization, ./pool) let a site import
// only what it needs (e.g. avoid bcrypt when it doesn't use passwords).

export { type BackendJwtConfig, backendJwtOptions, verifyBackendJwt } from "./jwt.js";
export { base58Id, fromPrefixedId, toPrefixedId, uuidGenerateId } from "./id.js";
export { type AuthEnv, authEnv, isConfigured } from "./keys.js";
export {
	bcryptPassword,
	makeEmailSenders,
	makePasskeyOptions,
	type PasskeyConfig,
	type SendEmail,
} from "./options.js";
export {
	lastActiveOrganizationHooks,
	lastActiveOrganizationUserField,
	nkOrganizationDefaults,
} from "./organization.js";
export { authBasePath } from "./paths.js";
export { createAuthPool } from "./pool.js";
