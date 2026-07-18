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

// Re-export the underlying primitives so a form route is a single import, and
// a site never needs to depend on @ingram-tech/bot-protection directly.
// `checkBot` is the raw Vercel BotID layer, for guarding non-form endpoints
// (a checkout, an authed route) where the full form pipeline doesn't fit.
export { checkBot, createFormToken, verifyHuman } from "@ingram-tech/bot-protection";
