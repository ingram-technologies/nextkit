/**
 * Escape the five characters that can break out of HTML text or attribute
 * contexts. Use it whenever interpolating user-controlled text (a name, a
 * subject, a body line) into an HTML email template.
 *
 * This lived as a copy-pasted helper in every email producer (the newsletter
 * package, each site's notifications module). It is the same five replacements
 * each time, so it belongs here — the one place every nextkit email path
 * already depends on — instead of drifting across N copies.
 */
export const escapeHtml = (value: string): string =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
