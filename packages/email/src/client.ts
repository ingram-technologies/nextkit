/**
 * Cloudflare Email Sending client.
 * Self-contained, zero dependencies beyond `fetch`.
 *
 * This is the canonical version of a client that had drifted into copies across
 * several Ingram sites — it merges every feature those copies had grown:
 *   - cc / bcc            (from a sister site)
 *   - custom headers      (from a sister site, for RFC 8058 List-Unsubscribe)
 *   - attachments         (shared)
 *
 * See {@link ./keys} for the required environment variables.
 */

export interface EmailAttachment {
	/** Base64-encoded file content. */
	content: string;
	filename: string;
	/** MIME type, e.g. "application/pdf". */
	type: string;
	disposition: "attachment";
}

export interface EmailOptions {
	to: string | string[];
	subject: string;
	text?: string;
	html?: string;
	/** Sender address. Use {@link fromAddress} to build one from EMAIL_FROM_DOMAIN. */
	from: string;
	replyTo?: string;
	cc?: string | string[];
	bcc?: string | string[];
	attachments?: EmailAttachment[];
	/**
	 * Custom RFC 5322 headers, e.g. List-Unsubscribe / List-Unsubscribe-Post
	 * (RFC 8058) for one-click newsletter unsubscribe.
	 */
	headers?: Record<string, string>;
}

const SEND_ENDPOINT = (accountId: string) =>
	`https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`;

/**
 * Build a `Name <local@domain>` sender address from `EMAIL_FROM_DOMAIN`.
 * @throws if `EMAIL_FROM_DOMAIN` is not configured.
 */
export const fromAddress = (name: string, localPart = "notifications"): string => {
	const domain = process.env.EMAIL_FROM_DOMAIN;
	if (!domain) {
		throw new Error(
			"@ingram-tech/email: EMAIL_FROM_DOMAIN environment variable not configured",
		);
	}
	return `${name} <${localPart}@${domain}>`;
};

/**
 * Send an email through the Cloudflare Email Sending API.
 * @throws if credentials are missing, content is empty, or the API errors.
 */
export const sendEmail = async (options: EmailOptions): Promise<void> => {
	const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
	const apiToken = process.env.CLOUDFLARE_EMAIL_API_TOKEN;

	if (!accountId || !apiToken) {
		throw new Error(
			"@ingram-tech/email: Cloudflare email credentials not configured (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_EMAIL_API_TOKEN)",
		);
	}

	if (!options.text && !options.html) {
		throw new Error(
			"@ingram-tech/email: email must have either text or html content",
		);
	}

	const body: Record<string, unknown> = {
		to: options.to,
		from: options.from,
		subject: options.subject,
	};
	if (options.text) body.text = options.text;
	if (options.html) body.html = options.html;
	if (options.replyTo) body.reply_to = options.replyTo;
	if (options.cc) body.cc = options.cc;
	if (options.bcc) body.bcc = options.bcc;
	if (options.attachments && options.attachments.length > 0) {
		body.attachments = options.attachments;
	}
	if (options.headers && Object.keys(options.headers).length > 0) {
		body.headers = options.headers;
	}

	const res = await fetch(SEND_ENDPOINT(accountId), {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiToken}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});

	if (!res.ok) {
		const errorBody = await res.text().catch(() => "");
		console.error("[@ingram-tech/email] Cloudflare API error", {
			status: res.status,
			body: errorBody,
		});
		throw new Error(
			`@ingram-tech/email: Cloudflare email API returned ${res.status}: ${errorBody}`,
		);
	}
};
