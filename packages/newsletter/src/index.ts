export {
	createNewsletter,
	type NewsletterConfig,
	type SendOptions,
	type SendResult,
	type SubscribeOptions,
} from "./client.js";
export {
	buildListUnsubscribeHeaders,
	derivePreviewText,
	type NewsletterRenderInput,
	renderNewsletterHtml,
	renderNewsletterText,
} from "./render.js";
export type { Newsletter, Subscription } from "./types.js";
