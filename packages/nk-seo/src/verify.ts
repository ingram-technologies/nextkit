/**
 * Runtime verification that a site actually serves the hreflang cluster it
 * advertises. Point it at a running deployment from CI or a test.
 *
 * hreflang is an unusual kind of markup: it is a set of promises about OTHER
 * URLs, and nothing local can tell you whether those promises hold. A site can
 * emit a flawless cluster while its middleware redirects every URL in it away,
 * or while each variant quietly canonicalizes to the default language. Both
 * delete the non-default languages from search, neither raises an error, and
 * Search Console reports them as ordinary redirects and duplicates months
 * later. The only way to know is to fetch the URLs and look.
 */
import { hreflangAlternates, type HreflangConfig } from "./alternates.js";

export interface HreflangProblem {
	/** The advertised URL the problem was found at. */
	url: string;
	/** The page whose cluster advertises it. */
	pathname: string;
	problem: string;
}

export interface VerifyHreflangOptions {
	/** Injectable for tests. Defaults to the global `fetch`. */
	fetch?: typeof globalThis.fetch;
	/**
	 * Also require `<html lang>` to match the locale the URL names. Default
	 * `true`. Turn it off only if the attribute carries a regional tag the
	 * cluster doesn't (e.g. `lang="fr-BE"` with `hreflang="fr"`).
	 */
	checkHtmlLang?: boolean;
}

/** Attributes of one HTML tag, lowercased keys, entity-decoded values. */
type Attrs = Record<string, string>;

const decode = (value: string): string =>
	value
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;|&apos;/g, "'");

const parseAttrs = (tag: string): Attrs => {
	const attrs: Attrs = {};
	const pattern =
		/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
	let match = pattern.exec(tag);
	while (match !== null) {
		const key = match[1]?.toLowerCase();
		const value = match[2] ?? match[3] ?? match[4] ?? "";
		if (key) attrs[key] = decode(value);
		match = pattern.exec(tag);
	}
	return attrs;
};

const tagsNamed = (html: string, name: string): Attrs[] => {
	const pattern = new RegExp(`<${name}\\b[^>]*>`, "gi");
	return (html.match(pattern) ?? []).map(parseAttrs);
};

/**
 * Fetch every URL the cluster for each pathname advertises and report what
 * doesn't hold. An empty array means the cluster is sound.
 *
 * Checks, per advertised URL:
 *  - it returns 200 and is not a redirect (an annotated URL that 3xx's is the
 *    single most common way to lose a language);
 *  - its canonical points at itself, not at the default language;
 *  - it advertises the whole cluster back (Google discards non-reciprocal
 *    annotations, silently);
 *  - `<html lang>` matches the locale the URL names.
 */
export async function verifyHreflangCluster(
	config: HreflangConfig,
	pathnames: readonly string[],
	options: VerifyHreflangOptions = {},
): Promise<HreflangProblem[]> {
	const doFetch = options.fetch ?? globalThis.fetch;
	const checkHtmlLang = options.checkHtmlLang ?? true;
	const problems: HreflangProblem[] = [];

	for (const pathname of pathnames) {
		const { links } = hreflangAlternates(config, pathname);
		const expected = links.map((link) => link.href);

		// Map each advertised URL back to the locale it names. `links` is the
		// locale list in order, then x-default; a real locale wins when the two
		// share a URL (the prefix strategy's default locale does).
		const localeOf = new Map<string, string | undefined>();
		links.forEach((link, index) => {
			const locale = config.locales[index];
			if (locale === undefined) {
				if (!localeOf.has(link.href)) localeOf.set(link.href, undefined);
				return;
			}
			localeOf.set(link.href, locale);
		});

		for (const [url, locale] of localeOf) {
			const add = (problem: string): void => {
				problems.push({ url, pathname, problem });
			};

			let response: Response;
			try {
				response = await doFetch(url, { redirect: "manual" });
			} catch (error) {
				add(
					`request failed: ${error instanceof Error ? error.message : error}`,
				);
				continue;
			}

			if (response.status >= 300 && response.status < 400) {
				const target = response.headers.get("location") ?? "(no location)";
				add(
					`advertised in hreflang but redirects (${response.status} → ${target}); ` +
						"an annotated URL must serve its language with a 200",
				);
				continue;
			}
			if (response.status !== 200) {
				add(`advertised in hreflang but returned ${response.status}`);
				continue;
			}

			const html = await response.text();

			const canonicals = tagsNamed(html, "link")
				.filter((attrs) => attrs.rel?.toLowerCase() === "canonical")
				.map((attrs) => attrs.href)
				.filter((href): href is string => href !== undefined);
			if (canonicals.length === 0) {
				add("no <link rel=canonical>");
			} else if (canonicals.length > 1) {
				add(
					`${canonicals.length} <link rel=canonical> tags; Google ignores all of them`,
				);
			} else if (canonicals[0] !== url) {
				add(
					`canonical points at ${canonicals[0]}, not itself; ` +
						"a variant that canonicalizes elsewhere is discarded",
				);
			}

			const advertised = new Set(
				tagsNamed(html, "link")
					.filter(
						(attrs) =>
							attrs.rel?.toLowerCase() === "alternate" && attrs.hreflang,
					)
					.map((attrs) => attrs.href)
					.filter((href): href is string => href !== undefined),
			);
			const missing = expected.filter((href) => !advertised.has(href));
			if (missing.length > 0) {
				add(
					`does not link back to ${missing.join(", ")}; ` +
						"hreflang must be reciprocal or Google drops the cluster",
				);
			}

			if (checkHtmlLang && locale !== undefined) {
				const lang = tagsNamed(html, "html")[0]?.lang;
				if (lang !== locale) {
					add(
						`serves <html lang="${lang ?? ""}"> but is advertised as "${locale}"`,
					);
				}
			}
		}
	}

	return problems;
}

/**
 * {@link verifyHreflangCluster}, but throws a single readable error listing every
 * problem. The shape to call from a test or a CI step.
 */
export async function assertHreflangCluster(
	config: HreflangConfig,
	pathnames: readonly string[],
	options?: VerifyHreflangOptions,
): Promise<void> {
	const problems = await verifyHreflangCluster(config, pathnames, options);
	if (problems.length === 0) return;
	const lines = problems.map((p) => `  ${p.url}\n    ${p.problem}`);
	throw new Error(
		`@ingram-tech/nk-seo: ${problems.length} hreflang problem(s):\n${lines.join("\n")}`,
	);
}
