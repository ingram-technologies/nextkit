import { describe, expect, it } from "vitest";
import {
	buildListUnsubscribeHeaders,
	derivePreviewText,
	renderNewsletterHtml,
	renderNewsletterText,
} from "./render";

const base = {
	newsletterName: "Acme Updates",
	subject: "Hello",
	content: "First paragraph.\n\nSecond paragraph.",
	unsubscribeUrl: "https://acme.test/api/newsletter/unsubscribe?token=abc",
};

describe("renderNewsletterHtml", () => {
	it("includes subject, paragraphs, and the unsubscribe link", () => {
		const html = renderNewsletterHtml(base);
		expect(html).toContain("Hello");
		expect(html).toContain("First paragraph.");
		expect(html).toContain("Second paragraph.");
		expect(html).toContain(base.unsubscribeUrl);
		expect(html).toContain("Acme Updates");
	});

	it("escapes HTML in content to prevent injection", () => {
		const html = renderNewsletterHtml({
			...base,
			content: "<script>alert(1)</script>",
		});
		expect(html).not.toContain("<script>alert(1)</script>");
		expect(html).toContain("&lt;script&gt;");
	});

	it("renders a CTA button when provided", () => {
		const html = renderNewsletterHtml({
			...base,
			cta: { label: "Read more", href: "https://acme.test/post" },
		});
		expect(html).toContain("Read more");
		expect(html).toContain("https://acme.test/post");
	});
});

describe("renderNewsletterText", () => {
	it("includes subject, content, and unsubscribe URL", () => {
		const text = renderNewsletterText(base);
		expect(text).toContain("Hello");
		expect(text).toContain("First paragraph.");
		expect(text).toContain(base.unsubscribeUrl);
	});
});

describe("buildListUnsubscribeHeaders", () => {
	it("extracts the address from a 'Name <addr>' sender (RFC 8058)", () => {
		const headers = buildListUnsubscribeHeaders(
			"https://acme.test/u?token=abc",
			"Acme <news@mail.acme.test>",
		);
		expect(headers["List-Unsubscribe"]).toBe(
			"<https://acme.test/u?token=abc>, <mailto:news@mail.acme.test?subject=unsubscribe>",
		);
		expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
	});

	it("falls back to a bare address", () => {
		const headers = buildListUnsubscribeHeaders(
			"https://acme.test/u",
			"news@mail.acme.test",
		);
		expect(headers["List-Unsubscribe"]).toContain(
			"mailto:news@mail.acme.test?subject=unsubscribe",
		);
	});
});

describe("derivePreviewText", () => {
	it("uses the first non-empty line", () => {
		expect(derivePreviewText("\n\n  Lead line  \nrest")).toBe("Lead line");
	});

	it("truncates long lines", () => {
		const long = "x".repeat(200);
		const preview = derivePreviewText(long);
		expect(preview.length).toBe(138); // 137 chars + ellipsis
		expect(preview.endsWith("…")).toBe(true);
	});

	it("returns empty for blank content", () => {
		expect(derivePreviewText("\n  \n")).toBe("");
	});
});
