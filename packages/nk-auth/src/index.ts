// Server entry. Browser re-exports live at "@ingram-tech/nk-auth/client" so
// importing the server presets never pulls in React.
export { type AuthEnv, authEnv, isConfigured } from "./keys";
export {
	bcryptPassword,
	makeEmailSenders,
	makePasskeyOptions,
	type PasskeyConfig,
	rlsJwtOptions,
	type SendEmail,
	uuidGenerateId,
} from "./options";
export {
	createServerSupabase,
	type ServerSupabaseConfig,
} from "./supabase";
