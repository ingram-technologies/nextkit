import { describe, expect, it } from "vitest";
import { escapeHtml } from "@ingram-tech/nk-email";
import { renderNotificationEmail } from "./email.js";

describe("renderNotificationEmail", () => {
	it("escapes every interpolated string in the HTML output", () => {
		const payload = `<x"'&>`;
		const { html } = renderNotificationEmail({
			heading: payload,
			fields: [{ label: payload, value: payload }],
			message: payload,
			footer: payload,
		});
		expect(html).not.toContain(payload);
		// All five inputs made it in, escaped (a dropped value would also pass the
		// line above).
		expect(html.split(escapeHtml(payload))).toHaveLength(6);
	});

	it("drops empty, blank, and missing fields", () => {
		const { html, text } = renderNotificationEmail({
			heading: "H",
			fields: [
				{ label: "Present", value: "yes" },
				{ label: "Empty", value: "" },
				{ label: "Blank", value: "   " },
				{ label: "Missing", value: null },
			],
		});
		expect(html).toContain("Present");
		expect(html).not.toContain("Empty");
		expect(html).not.toContain("Blank");
		expect(html).not.toContain("Missing");
		expect(text).toContain("Present: yes");
	});

	it("includes the message and footer in the text output", () => {
		const { text } = renderNotificationEmail({
			heading: "H",
			message: "hello",
			footer: "Sent from the acme.test contact form.",
		});
		expect(text).toContain("Message:");
		expect(text).toContain("hello");
		expect(text).toContain("Sent from the acme.test contact form.");
	});
});
