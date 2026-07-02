/**
 * JSON.stringify hardened for inline `<script>` bodies. `<` is escaped so a
 * string value containing `</script>` (FAQ answers and article headlines often
 * come from a CMS) cannot terminate the tag and inject markup; U+2028/2029 are
 * escaped because they are valid JSON but not valid JS source.
 */
// U+2028/U+2029 via RegExp() so the source stays ASCII (a literal invisible
// character would be one editor "normalization" away from silently vanishing).
const LINE_SEPARATORS = new RegExp("[\\u2028\\u2029]", "g");

export const serializeJsonLd = (data: object | object[]): string =>
	JSON.stringify(data)
		.replace(/</g, "\\u003c")
		.replace(LINE_SEPARATORS, (char) => {
			const hex = char.codePointAt(0)?.toString(16) ?? "";
			return "\\u" + hex;
		});

/**
 * Renders one or more schema.org JSON-LD nodes into a
 * `<script type="application/ld+json">`. Works in server and client components.
 *
 * @example
 * <JsonLd data={faqPage(items)} />
 * <JsonLd data={[organization(org), website(site)]} />
 */
export function JsonLd({ data }: { data: object | object[] }) {
	return (
		<script
			type="application/ld+json"
			// oxlint-disable-next-line no-danger -- serializeJsonLd escapes `<`, so content strings cannot break out of the script tag
			dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
		/>
	);
}
