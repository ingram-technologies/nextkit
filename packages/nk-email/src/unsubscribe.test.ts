import { describe, expect, it } from "vitest";
import { escapeHtml } from "./html.js";
import { buildListUnsubscribeHeaders } from "./unsubscribe.js";

describe("escapeHtml", () => {
	it("leaves none of the five HTML-significant characters raw", () => {
		const escaped = escapeHtml(`<a href="x">Tom & Jerry's</a>`);
		// Every `&` left must open a character reference; nothing else may survive.
		const withoutEntities = escaped.replace(/&(?:[a-z]+|#\d+|#x[\da-f]+);/gi, "");
		expect(withoutEntities).not.toMatch(/[<>"'&]/);
		expect(withoutEntities).toContain("Tom");
	});

	it("escapes ampersands before other entities (no double-encoding)", () => {
		expect(escapeHtml("&lt;")).toBe("&amp;lt;");
	});
});

describe("buildListUnsubscribeHeaders", () => {
	it.each([
		["a newline in the url", { url: "https://x.test/u\r\nBcc: v@x.test" }],
		["a control character in the url", { url: "https://x.test/u\x00" }],
		["an angle bracket in the url", { url: "https://x.test/u>" }],
		["a comma in the url", { url: "https://x.test/u,<https://evil.test>" }],
		["a newline in the mailto", { url: "https://x.test/u", mailto: "a@x.test\n" }],
		["an angle bracket in the mailto", { url: "https://x.test/u", mailto: "<a@x" }],
	])("rejects %s", (_label, unsubscribe) => {
		expect(() => buildListUnsubscribeHeaders(unsubscribe)).toThrow(
			/must not contain/,
		);
	});

	it("builds a URL-only one-click header pair", () => {
		expect(
			buildListUnsubscribeHeaders({ url: "https://x.test/u?token=abc" }),
		).toEqual({
			"List-Unsubscribe": "<https://x.test/u?token=abc>",
			"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
		});
	});

	it("expands a bare mailto address with an unsubscribe subject", () => {
		const headers = buildListUnsubscribeHeaders({
			url: "https://x.test/u",
			mailto: "news@mail.x.test",
		});
		expect(headers["List-Unsubscribe"]).toBe(
			"<https://x.test/u>, <mailto:news@mail.x.test?subject=unsubscribe>",
		);
	});

	it("passes through a full mailto: string untouched", () => {
		const headers = buildListUnsubscribeHeaders({
			url: "https://x.test/u",
			mailto: "mailto:bye@mail.x.test?subject=stop",
		});
		expect(headers["List-Unsubscribe"]).toBe(
			"<https://x.test/u>, <mailto:bye@mail.x.test?subject=stop>",
		);
	});
});
