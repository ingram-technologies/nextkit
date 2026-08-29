// Server entry — no React. The client hook and components live at
// "@ingram-tech/nk-forms/react" so importing the handler never pulls in React.
export {
	type FormHandlerOptions,
	type FormSchema,
	handleFormSubmission,
	type RateLimitDecision,
} from "./handler.js";
export {
	type NotificationEmailOptions,
	type NotificationField,
	type RenderedEmail,
	renderNotificationEmail,
} from "./email.js";
export { mintFormToken } from "./token.js";

// The bot-protection layers, exported from the root so a form route is a single
// import. `checkBot` is the raw Vercel BotID layer on its own, for guarding a
// non-form endpoint (a checkout, an authed route) where the full pipeline and
// its silent-drop contract don't fit.
export { checkBot } from "./bot/botid.js";
export { HONEYPOT_FIELD, TOKEN_FIELD } from "./bot/fields.js";
export {
	createFormToken,
	type TokenCheck,
	type TokenResult,
	verifyFormToken,
} from "./bot/timing-token.js";
export { type VerifyOptions, type VerifyResult, verifyHuman } from "./bot/verify.js";
export { isConfigured } from "./keys.js";
