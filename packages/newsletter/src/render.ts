/** Inputs the default renderer (or a custom one) receives per send. */
export interface NewsletterRenderInput {
	newsletterName: string;
	subject: string;
	/** Plain-text body; blank lines split paragraphs. */
	content: string;
	cta?: { label: string; href: string } | null;
	unsubscribeUrl: string;
	/** Inbox-preview headline. */
	previewText?: string;
}

const escapeHtml = (value: string): string =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");

/** Minimal, dependency-free HTML email. Override via `createNewsletter({ render })`. */
export const renderNewsletterHtml = (input: NewsletterRenderInput): string => {
	const paragraphs = input.content
		.split(/\n\s*\n/)
		.map((p) => p.trim())
		.filter(Boolean)
		.map(
			(p) =>
				`<p style="margin:0 0 16px;line-height:1.6;">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`,
		)
		.join("\n");

	const cta = input.cta
		? `<p style="margin:24px 0;"><a href="${escapeHtml(input.cta.href)}" style="background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;">${escapeHtml(input.cta.label)}</a></p>`
		: "";

	return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111;">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(input.previewText ?? "")}</div>
<h1 style="font-size:20px;margin:0 0 16px;">${escapeHtml(input.subject)}</h1>
${paragraphs}
${cta}
<hr style="border:none;border-top:1px solid #e5e5e5;margin:32px 0 16px;"/>
<p style="font-size:12px;color:#888;">You're receiving this because you subscribed to ${escapeHtml(input.newsletterName)}. <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#888;">Unsubscribe</a>.</p>
</body></html>`;
};

export const renderNewsletterText = (input: NewsletterRenderInput): string =>
	`${input.subject}\n\n${input.content}\n\n${
		input.cta ? `${input.cta.label}: ${input.cta.href}\n\n` : ""
	}---\nYou're receiving this because you subscribed to ${input.newsletterName}.\nUnsubscribe: ${input.unsubscribeUrl}`;

/**
 * RFC 8058 List-Unsubscribe headers for one-click unsubscribe in Gmail/Apple
 * Mail. `fromAddr` may be "Name <local@domain>" or a bare address.
 */
export const buildListUnsubscribeHeaders = (
	unsubscribeUrl: string,
	fromAddr: string,
): Record<string, string> => {
	const match = fromAddr.match(/<([^>]+)>/);
	const mailto = match?.[1] ?? fromAddr;
	return {
		"List-Unsubscribe": `<${unsubscribeUrl}>, <mailto:${mailto}?subject=unsubscribe>`,
		"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
	};
};

/** First non-empty line, trimmed to ~140 chars — a sensible preview default. */
export const derivePreviewText = (content: string): string => {
	const first = content
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.length > 0);
	if (!first) return "";
	return first.length > 140 ? `${first.slice(0, 137)}…` : first;
};
