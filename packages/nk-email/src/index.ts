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
export {
	defineEmailCatalog,
	type EmailCatalog,
	EMAIL_CATALOG_VERSION,
	type EmailCatalogEntry,
	serializeEmailCatalog,
} from "./catalog.js";
export {
	type EmailBody,
	type EmailKind,
	type EmailLogRecord,
	type EmailStatus,
	MAX_LOGGED_BODY_CHARS,
	MAX_LOGGED_META_CHARS,
	type Queryable,
	recordEmail,
} from "./log.js";
export {
	createMailer,
	type Mailer,
	type MailerConfig,
	type SendOptions,
} from "./mailer.js";
