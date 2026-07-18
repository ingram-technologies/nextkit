/**
 * Pick the best supported locale from an `Accept-Language` header value.
 * Compares on the primary subtag only (`fr-BE` → `fr`), case-insensitively on
 * **both** sides (so `supported: ["EN"]` or `["en-US"]` still match an `en`
 * header), honoring q-values per RFC 9110: highest quality wins (header order
 * breaks ties), and `q=0` — an explicit rejection — never matches. Returns the
 * matching entry from `supported` verbatim (its own casing), or `undefined`
 * when nothing matches. Pure — compose it inside a framework-specific locale
 * resolver.
 */
export function negotiateAcceptLanguage(
	header: string | null | undefined,
	supported: readonly string[],
): string | undefined {
	if (!header) return undefined;
	// Map each supported locale's primary subtag (lowercased) back to the entry as
	// written, so the comparison is case-insensitive but the returned value keeps
	// the caller's canonical form. First entry wins a shared primary subtag.
	const byPrimary = new Map<string, string>();
	for (const entry of supported) {
		const key = entry.split("-")[0]?.toLowerCase();
		if (key && !byPrimary.has(key)) byPrimary.set(key, entry);
	}
	const candidates: { lang: string; q: number; index: number }[] = [];
	header.split(",").forEach((part, index) => {
		const [tag, ...params] = part.split(";");
		const lang = tag?.trim().split("-")[0]?.toLowerCase();
		if (!lang) return;
		let q = 1;
		for (const param of params) {
			const match = /^\s*q\s*=\s*(\d(?:\.\d{0,3})?)\s*$/i.exec(param);
			if (match) q = Math.min(Number(match[1]), 1);
		}
		if (q > 0) candidates.push({ lang, q, index });
	});
	candidates.sort((a, b) => b.q - a.q || a.index - b.index);
	const winner = candidates.find((c) => byPrimary.has(c.lang));
	return winner ? byPrimary.get(winner.lang) : undefined;
}
