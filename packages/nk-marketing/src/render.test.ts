import { escapeHtml } from "@ingram-tech/nk-email";
import { describe, expect, it } from "vitest";
import {
	derivePreviewText,
	type MarketingRenderInput,
	renderMarketingHtml,
	renderMarketingText,
} from "./render.js";

const base: MarketingRenderInput = {
	subject: "Hello",
	content: "First paragraph.\n\nSecond paragraph.",
	unsubscribeUrl: "https://acme.test/api/marketing/unsubscribe?token=abc",
	footerReason: "you have an account with Acme",
};

describe("renderMarketingHtml", () => {
	it("includes subject, paragraphs, footer reason, and unsubscribe link", () => {
		const html = renderMarketingHtml(base);
		expect(html).toContain("Hello");
		expect(html).toContain("First paragraph.");
		expect(html).toContain("Second paragraph.");
		expect(html).toContain(base.unsubscribeUrl);
		expect(html).toContain("you have an account with Acme");
	});

	it("escapes every interpolated string to prevent injection", () => {
		const payload = `<x"'&>`;
		const html = renderMarketingHtml({
			subject: payload,
			content: payload,
			cta: { label: payload, href: payload },
			unsubscribeUrl: payload,
			previewText: payload,
			footerReason: payload,
		});
		expect(html).not.toContain(payload);
		// Seven inputs, each present in escaped form: none was dropped to pass.
		expect(html.split(escapeHtml(payload))).toHaveLength(8);
	});

	it("renders a CTA button when provided", () => {
		const html = renderMarketingHtml({
			...base,
			cta: { label: "Send an invoice", href: "https://acme.test/send" },
		});
		expect(html).toContain("Send an invoice");
		expect(html).toContain("https://acme.test/send");
	});
});

describe("renderMarketingText", () => {
	it("includes subject, content, footer reason, and unsubscribe URL", () => {
		const text = renderMarketingText(base);
		expect(text).toContain("Hello");
		expect(text).toContain("First paragraph.");
		expect(text).toContain("you have an account with Acme");
		expect(text).toContain(base.unsubscribeUrl);
	});
});

describe("derivePreviewText", () => {
	it("uses the first non-empty line", () => {
		expect(derivePreviewText("\n\n  Lead line  \nrest")).toBe("Lead line");
	});

	it("truncates long lines", () => {
		const preview = derivePreviewText("x".repeat(200));
		expect(preview.length).toBe(138); // 137 chars + ellipsis
		expect(preview.endsWith("…")).toBe(true);
	});

	it("never splits an emoji when truncating", () => {
		const preview = derivePreviewText("😀".repeat(200));
		// A lone surrogate is what renders as U+FFFD in the inbox.
		expect(preview).not.toMatch(
			/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/,
		);
		expect(preview.endsWith("…")).toBe(true);
	});

	it("returns empty for blank content", () => {
		expect(derivePreviewText("\n  \n")).toBe("");
	});
});
