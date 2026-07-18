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

// Re-export the underlying primitives so a form route is a single import.
export { createFormToken, verifyHuman } from "@ingram-tech/bot-protection";
