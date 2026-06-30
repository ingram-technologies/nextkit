/**
 * Renders one or more schema.org JSON-LD nodes into a
 * `<script type="application/ld+json">`. Works in server and client components.
 *
 * The payload is trusted, server-built structured data (never user input), so
 * serialising it into the script body is safe — that is how JSON-LD ships.
 *
 * @example
 * <JsonLd data={faqPage(items)} />
 * <JsonLd data={[organization(org), website(site)]} />
 */
export function JsonLd({ data }: { data: object | object[] }) {
	return (
		<script
			type="application/ld+json"
			// oxlint-disable-next-line no-danger -- trusted, server-built structured data, not user input
			dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
		/>
	);
}
