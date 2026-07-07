/**
 * RFC 8058 one-click List-Unsubscribe support.
 *
 * Any email that is not strictly transactional — a newsletter issue, a
 * post-signup lifecycle nudge, any marketing send — MUST carry these two
 * headers (and a visible unsubscribe link in the body) to satisfy the Gmail /
 * Yahoo bulk-sender rules and to stay out of spam folders. Getting the header
 * shape exactly right (angle brackets, the comma-separated entries, the
 * `-Post` companion that actually upgrades it to true one-click) is fiddly and
 * was being re-derived per site. This is the canonical builder; `sendEmail`
 * accepts a {@link ListUnsubscribe} directly via `options.listUnsubscribe`, and
 * higher-level senders (`@ingram-tech/nk-marketing`) reuse it.
 */

export interface ListUnsubscribe {
	/**
	 * One-click unsubscribe URL — the target Gmail/Apple Mail POST to when the
	 * reader hits "Unsubscribe". Make it idempotent and unauthenticated (it is
	 * called without the user's session), keyed by an unguessable token.
	 */
	url: string;
	/**
	 * Optional mailto fallback. A bare address (`news@example.com`) is expanded
	 * to `mailto:news@example.com?subject=unsubscribe`; pass a full `mailto:…`
	 * string to control the subject/body yourself. Omit for a URL-only header.
	 */
	mailto?: string;
}

/**
 * Build the `List-Unsubscribe` + `List-Unsubscribe-Post` header pair for one
 * recipient. The `-Post` header is what makes it genuine one-click (RFC 8058);
 * without it Gmail merely renders a link the user must visit. Returns a plain
 * record ready to spread into {@link EmailOptions.headers}.
 */
export const buildListUnsubscribeHeaders = (
	unsubscribe: ListUnsubscribe,
): Record<string, string> => {
	// The values are wrapped in <…> and comma-joined into one header: an
	// angle bracket, comma, or control char inside them silently corrupts the
	// header (or injects another one). URL-encode tokens upstream.
	// oxlint-disable-next-line no-control-regex -- header-injection guard
	const invalid = /[\x00-\x1f\x7f<>,]/;
	if (invalid.test(unsubscribe.url) || invalid.test(unsubscribe.mailto ?? "")) {
		throw new Error(
			"@ingram-tech/nk-email: List-Unsubscribe values must not contain control characters, angle brackets, or commas",
		);
	}
	const entries = [`<${unsubscribe.url}>`];
	if (unsubscribe.mailto) {
		const mailto = unsubscribe.mailto.startsWith("mailto:")
			? unsubscribe.mailto
			: `mailto:${unsubscribe.mailto}?subject=unsubscribe`;
		entries.push(`<${mailto}>`);
	}
	return {
		"List-Unsubscribe": entries.join(", "),
		"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
	};
};
