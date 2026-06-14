/**
 * Pick the best supported locale from an `Accept-Language` header value.
 * Compares on the primary subtag only (`fr-BE` → `fr`), case-insensitively, and
 * returns the first supported match in header order, or `undefined` if none
 * match. Pure — compose it inside a framework-specific locale resolver.
 */
export function negotiateAcceptLanguage(
	header: string | null | undefined,
	supported: readonly string[],
): string | undefined {
	if (!header) return undefined;
	for (const part of header.split(",")) {
		const lang = part.split(";")[0]?.trim().split("-")[0]?.toLowerCase();
		if (lang && supported.includes(lang)) return lang;
	}
	return undefined;
}
