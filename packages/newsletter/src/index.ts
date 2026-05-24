export {
	createNewsletter,
	type NewsletterConfig,
	type SendOptions,
	type SendResult,
	type SubscribeOptions,
} from "./client";
export {
	buildListUnsubscribeHeaders,
	derivePreviewText,
	type NewsletterRenderInput,
	renderNewsletterHtml,
	renderNewsletterText,
} from "./render";
export type { Newsletter, Subscription } from "./types";
