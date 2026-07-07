export {
	DEFAULT_TIMEOUT_MS,
	type EmailAttachment,
	type EmailOptions,
	fromAddress,
	sendEmail,
} from "./client.js";
export { escapeHtml } from "./html.js";
export { buildListUnsubscribeHeaders, type ListUnsubscribe } from "./unsubscribe.js";
export { type EmailEnv, isConfigured, keys } from "./keys.js";
