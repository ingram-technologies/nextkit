/**
 * Email catalog — a machine-readable manifest of every message a site sends and
 * the occasion that triggers it.
 *
 * The problem this solves: an operator (in an admin panel, a different app) wants
 * to see "what emails does this product send, when, and what do they look like?"
 * without reading the code. The trick that keeps such a preview from drifting out
 * of date is to build each catalog entry from *the same builder the real sender
 * uses* — so the previewed subject/html/text is byte-for-byte what would be
 * dispatched. This module only carries the shape and a serializer; the "build it
 * from the real builder" discipline lives in the consuming site's catalog file.
 *
 * nk-email has no templating of its own (callers pass raw html/text), so a
 * catalog entry already holds *rendered* strings — the site renders a sample
 * through whatever it uses (its own layout, react-email, …) and hands the result
 * here. See README "Email catalog".
 *
 * Typical flow: the site declares `defineEmailCatalog([...])`, a tiny build step
 * writes `serializeEmailCatalog(...)` to a committed `email-catalog.json`, and an
 * operator surface reads that JSON. Zero-dependency and zero runtime footprint —
 * no route, no send.
 */

/** The current on-disk shape version. Bump on a breaking change to an entry. */
export const EMAIL_CATALOG_VERSION = 1;

/**
 * One message a product sends. `subject`/`html`/`text` are the *rendered*
 * output — identical to what {@link EmailOptions} would carry — so a preview is
 * exactly the real thing. Everything else describes it for a human browsing the
 * catalog.
 */
export interface EmailCatalogEntry {
	/** URL-safe stable id, unique within the catalog (used as a selection key). */
	key: string;
	/** Sidebar grouping, e.g. "Registration", "Billing", "Auth". */
	group: string;
	/** Human name, e.g. "Payment receipt". */
	name: string;
	/** Optional audience chip, e.g. "Customer", "Internal", "Auth". */
	audience?: string;
	/** Prose: *when* it's sent and by what trigger. The one hand-written field. */
	scenario: string;
	/** Rendered subject line. */
	subject: string;
	/**
	 * Rendered HTML body. Optional so a text-only message can omit it (a real
	 * send may carry only one part) — but an entry must have `html` or `text`,
	 * which {@link defineEmailCatalog} enforces.
	 */
	html?: string;
	/** Rendered plain-text body. Optional — see {@link html}. */
	text?: string;
}

/** The serialized manifest an operator surface reads. */
export interface EmailCatalog {
	version: number;
	/** Optional product label for display, e.g. "Acme". */
	product?: string;
	entries: EmailCatalogEntry[];
}

const KEY_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Validate and freeze a catalog. Throws on a duplicate or malformed `key`, or an
 * entry missing both bodies — failing at build time (when the file is generated)
 * rather than shipping a broken manifest. Returns the entries unchanged (frozen)
 * so the call site reads as a declaration.
 */
export const defineEmailCatalog = (
	entries: EmailCatalogEntry[],
): readonly EmailCatalogEntry[] => {
	const seen = new Set<string>();
	for (const entry of entries) {
		if (!KEY_PATTERN.test(entry.key)) {
			throw new Error(
				`@ingram-tech/nk-email: catalog key "${entry.key}" must match ${KEY_PATTERN} (lowercase, digits, dashes)`,
			);
		}
		if (seen.has(entry.key)) {
			throw new Error(
				`@ingram-tech/nk-email: duplicate catalog key "${entry.key}"`,
			);
		}
		seen.add(entry.key);
		if (!entry.html && !entry.text) {
			throw new Error(
				`@ingram-tech/nk-email: catalog entry "${entry.key}" has neither html nor text`,
			);
		}
	}
	return Object.freeze([...entries]);
};

/**
 * Serialize a catalog to the JSON an operator surface reads. Write the result to
 * a committed `email-catalog.json` from a build/CI step so the manifest tracks
 * the code. `product` labels the manifest for display.
 */
export const serializeEmailCatalog = (
	entries: readonly EmailCatalogEntry[],
	options: { product?: string; pretty?: boolean } = {},
): string => {
	const catalog: EmailCatalog = {
		version: EMAIL_CATALOG_VERSION,
		...(options.product ? { product: options.product } : {}),
		entries: [...entries],
	};
	return JSON.stringify(catalog, null, options.pretty === false ? undefined : "\t");
};
