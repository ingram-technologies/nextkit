// Server entry — the Ingram Better Auth foundation. Browser re-exports live at
// "@ingram-tech/nk-auth/client" so importing the server presets never pulls in
// React. Focused subpaths (./jwt, ./organization, ./pool) let a site import
// only what it needs (e.g. avoid bcrypt/supabase when it uses neither).

export {
	type BackendJwtConfig,
	backendJwtOptions,
	rlsJwtOptions,
	verifyBackendJwt,
} from "./jwt";
export { type AuthEnv, authEnv, isConfigured } from "./keys";
export {
	bcryptPassword,
	makeEmailSenders,
	makePasskeyOptions,
	type PasskeyConfig,
	type SendEmail,
	uuidGenerateId,
} from "./options";
export {
	lastActiveOrganizationHooks,
	lastActiveOrganizationUserField,
	nkOrganizationDefaults,
} from "./organization";
export { createAuthPool } from "./pool";
export {
	createServerSupabase,
	type ServerSupabaseConfig,
} from "./supabase";
