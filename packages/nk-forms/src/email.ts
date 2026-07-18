import { escapeHtml } from "@ingram-tech/nk-email";

/** One labelled row in a notification email. Empty/blank values are dropped. */
export interface NotificationField {
	label: string;
	value: string | null | undefined;
}

export interface NotificationEmailOptions {
	/** The email's heading, e.g. "New contact form submission". */
	heading: string;
	/** Labelled key/value rows rendered as a table. */
	fields?: NotificationField[];
	/** Free-text body rendered in a pre-wrap block (the user's message). */
	message?: string | null;
	/** Small footer line, e.g. "Sent from the acme.test contact form.". */
	footer?: string;
}

export interface RenderedEmail {
	html: string;
	text: string;
}

/**
 * Render a submission into `{ html, text }` for `sendEmail`, with **every**
 * interpolated value escaped via `@ingram-tech/nk-email`'s `escapeHtml`.
 *
 * This exists because each site hand-rolled its own notification HTML and most
 * interpolated `name`/`email`/`message` straight into the markup unescaped — an
 * HTML-injection footgun in the inbox. Rendering through here makes escaping the
 * default instead of a per-site coin flip.
 */
export const renderNotificationEmail = (
	options: NotificationEmailOptions,
): RenderedEmail => {
	const fields = (options.fields ?? []).filter(
		(field): field is { label: string; value: string } =>
			typeof field.value === "string" && field.value.trim() !== "",
	);

	const rows = fields
		.map(
			(field) =>
				`<tr><td style="padding:4px 12px 4px 0;color:#666;">${escapeHtml(field.label)}</td><td style="padding:4px 0;">${escapeHtml(field.value)}</td></tr>`,
		)
		.join("");

	const table = rows
		? `<table style="border-collapse:collapse;font-size:14px;">${rows}</table>`
		: "";

	const messageBlock = options.message
		? `<div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0;"><p style="white-space:pre-wrap;margin:0;">${escapeHtml(options.message)}</p></div>`
		: "";

	const footerBlock = options.footer
		? `<p style="color:#888;font-size:13px;margin-top:20px;">${escapeHtml(options.footer)}</p>`
		: "";

	const html = [
		`<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">`,
		`<h2 style="color:#333;">${escapeHtml(options.heading)}</h2>`,
		table,
		messageBlock,
		footerBlock,
		`</div>`,
	]
		.filter((part) => part !== "")
		.join("\n");

	const textLines = [options.heading, ""];
	for (const field of fields) {
		textLines.push(`${field.label}: ${field.value}`);
	}
	if (options.message) {
		textLines.push("", "Message:", options.message);
	}
	if (options.footer) {
		textLines.push("", "---", options.footer);
	}

	return { html, text: textLines.join("\n") };
};
