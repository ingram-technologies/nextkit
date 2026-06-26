/**
 * The default, dependency-free HTML + text renderer for marketing email. Shared
 * by broadcasts and lifecycle sends; override per `createMarketing({ render })`
 * to drop in your own template (e.g. React Email). HTML escaping comes from
 * `@ingram-tech/nk-email` so there is exactly one copy of it.
 */

import { escapeHtml } from "@ingram-tech/nk-email";
import type { Cta } from "./types.js";

/** Inputs the default renderer (or a custom one) receives per recipient. */
export interface MarketingRenderInput {
	subject: string;
	/** Plain-text body; blank lines split paragraphs. */
	content: string;
	cta?: Cta | null;
	/** Absolute one-click unsubscribe URL for this recipient. */
	unsubscribeUrl: string;
	/** Inbox-preview headline. */
	previewText?: string;
	/**
	 * Why this person is receiving the email, completing "You're receiving this
	 * because …" — e.g. "you subscribed to Acme Updates" or "you have an Acme
	 * account".
	 */
	footerReason: string;
}

/** Minimal, dependency-free HTML email. */
export const renderMarketingHtml = (input: MarketingRenderInput): string => {
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
<p style="font-size:12px;color:#888;">You're receiving this because ${escapeHtml(input.footerReason)}. <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#888;">Unsubscribe</a>.</p>
</body></html>`;
};

/** Plain-text counterpart of {@link renderMarketingHtml}. */
export const renderMarketingText = (input: MarketingRenderInput): string =>
	`${input.subject}\n\n${input.content}\n\n${
		input.cta ? `${input.cta.label}: ${input.cta.href}\n\n` : ""
	}---\nYou're receiving this because ${input.footerReason}.\nUnsubscribe: ${input.unsubscribeUrl}`;

/** First non-empty line, trimmed to ~140 chars — a sensible preview default. */
export const derivePreviewText = (content: string): string => {
	const first = content
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.length > 0);
	if (!first) return "";
	return first.length > 140 ? `${first.slice(0, 137)}…` : first;
};
