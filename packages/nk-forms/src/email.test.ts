import { describe, expect, it } from "vitest";
import { renderNotificationEmail } from "./email.js";

describe("renderNotificationEmail", () => {
	it("escapes user input in the HTML output", () => {
		const { html } = renderNotificationEmail({
			heading: "New inquiry",
			fields: [{ label: "Name", value: "<script>alert(1)</script>" }],
			message: "1 < 2 & 3 > 2",
		});
		expect(html).not.toContain("<script>");
		expect(html).toContain("&lt;script&gt;");
		expect(html).toContain("1 &lt; 2 &amp; 3 &gt; 2");
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
