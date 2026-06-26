import { describe, expect, it } from "vitest";
import { escapeHtml } from "./html.js";
import { buildListUnsubscribeHeaders } from "./unsubscribe.js";

describe("escapeHtml", () => {
	it("escapes the five HTML-significant characters", () => {
		expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe(
			"&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;",
		);
	});

	it("escapes ampersands before other entities (no double-encoding)", () => {
		expect(escapeHtml("&lt;")).toBe("&amp;lt;");
	});
});

describe("buildListUnsubscribeHeaders", () => {
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
