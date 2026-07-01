/**
 * Typed schema.org JSON-LD builders. Each returns a plain object ready to hand
 * to `<JsonLd>` (from "@ingram-tech/nk-seo/components").
 *
 * The standalone builders take values as-is: pass **absolute** URLs for
 * `url`/`image`/`logo` fields. If your pages work in site-relative paths and
 * share one Organization, prefer {@link createSeo}, which resolves paths against
 * a base URL and injects the publisher/provider for you.
 */

const CONTEXT = "https://schema.org";

/** A schema.org node. Hand it to `<JsonLd data={...} />`. */
export type JsonLdNode = Record<string, unknown>;

// --- FAQPage ---------------------------------------------------------------

export interface FaqItem {
	question: string;
	answer: string;
}

/** FAQPage: marks up a list of question/answer pairs for FAQ rich results. */
export function faqPage(items: FaqItem[]): JsonLdNode {
	return {
		"@context": CONTEXT,
		"@type": "FAQPage",
		mainEntity: items.map((item) => ({
			"@type": "Question",
			name: item.question,
			acceptedAnswer: { "@type": "Answer", text: item.answer },
		})),
	};
}

// --- BreadcrumbList --------------------------------------------------------

export interface BreadcrumbItem {
	name: string;
	/** Absolute URL of the crumb. */
	url: string;
}

/** BreadcrumbList: the trail of links Google shows in place of the raw URL. */
export function breadcrumbList(items: BreadcrumbItem[]): JsonLdNode {
	return {
		"@context": CONTEXT,
		"@type": "BreadcrumbList",
		itemListElement: items.map((item, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: item.name,
			item: item.url,
		})),
	};
}

// --- Organization ----------------------------------------------------------

export interface OrganizationInput {
	name: string;
	/** Absolute URL of the organization's site. */
	url?: string;
	/** Absolute URL of the logo image. */
	logo?: string;
	description?: string;
	email?: string;
	telephone?: string;
	/** Registered/office postal address. */
	address?: PostalAddressInput;
	/** Profile/social URLs that corroborate the entity (LinkedIn, Crunchbase…). */
	sameAs?: string[];
}

/** Organization node without `@context`, for embedding as publisher/provider. */
function organizationNode(input: OrganizationInput): JsonLdNode {
	return {
		"@type": "Organization",
		name: input.name,
		...(input.url ? { url: input.url } : {}),
		...(input.logo ? { logo: { "@type": "ImageObject", url: input.logo } } : {}),
		...(input.description ? { description: input.description } : {}),
		...(input.email ? { email: input.email } : {}),
		...(input.telephone ? { telephone: input.telephone } : {}),
		...(input.address
			? { address: { "@type": "PostalAddress", ...input.address } }
			: {}),
		...(input.sameAs?.length ? { sameAs: input.sameAs } : {}),
	};
}

/** Organization: the entity behind the site (for the knowledge panel). */
export function organization(input: OrganizationInput): JsonLdNode {
	return { "@context": CONTEXT, ...organizationNode(input) };
}

// --- WebSite ---------------------------------------------------------------

export interface WebsiteInput {
	name: string;
	/** Absolute URL of the site root. */
	url: string;
	publisher?: OrganizationInput;
}

/** WebSite: identifies the site as an entity; pair with {@link organization}. */
export function website(input: WebsiteInput): JsonLdNode {
	return {
		"@context": CONTEXT,
		"@type": "WebSite",
		name: input.name,
		url: input.url,
		...(input.publisher ? { publisher: organizationNode(input.publisher) } : {}),
	};
}

// --- SoftwareApplication ---------------------------------------------------

export interface OfferInput {
	priceCurrency: string;
	/** Single price. Mutually exclusive with low/high (which emit an AggregateOffer). */
	price?: string | number;
	lowPrice?: string | number;
	highPrice?: string | number;
	offerCount?: string | number;
	/** Absolute URL of the pricing/offer page. */
	url?: string;
}

function offerNode(offer: OfferInput): JsonLdNode {
	const isAggregate = offer.lowPrice !== undefined || offer.highPrice !== undefined;
	if (isAggregate) {
		return {
			"@type": "AggregateOffer",
			priceCurrency: offer.priceCurrency,
			...(offer.lowPrice !== undefined
				? { lowPrice: String(offer.lowPrice) }
				: {}),
			...(offer.highPrice !== undefined
				? { highPrice: String(offer.highPrice) }
				: {}),
			...(offer.offerCount !== undefined
				? { offerCount: String(offer.offerCount) }
				: {}),
			...(offer.url ? { url: offer.url } : {}),
		};
	}
	return {
		"@type": "Offer",
		priceCurrency: offer.priceCurrency,
		...(offer.price !== undefined ? { price: String(offer.price) } : {}),
		...(offer.url ? { url: offer.url } : {}),
	};
}

export interface SoftwareApplicationInput {
	name: string;
	description?: string;
	/** Absolute URL of the app/marketing page. */
	url?: string;
	/** e.g. "BusinessApplication", "FinanceApplication". */
	applicationCategory?: string;
	/** e.g. "Web". */
	operatingSystem?: string;
	offers?: OfferInput;
}

/** SoftwareApplication: marks a product page as an app for rich results. */
export function softwareApplication(input: SoftwareApplicationInput): JsonLdNode {
	return {
		"@context": CONTEXT,
		"@type": "SoftwareApplication",
		name: input.name,
		...(input.applicationCategory
			? { applicationCategory: input.applicationCategory }
			: {}),
		...(input.operatingSystem ? { operatingSystem: input.operatingSystem } : {}),
		...(input.url ? { url: input.url } : {}),
		...(input.description ? { description: input.description } : {}),
		...(input.offers ? { offers: offerNode(input.offers) } : {}),
	};
}

// --- Article ---------------------------------------------------------------

export interface ArticleAuthor {
	name: string;
	/** Absolute URL of the author's profile/page. */
	url?: string;
}

export interface ArticleInput {
	headline: string;
	/** Absolute canonical URL of the article. */
	url: string;
	description?: string;
	type?: "Article" | "BlogPosting" | "NewsArticle" | "ScholarlyArticle";
	datePublished?: string;
	/** Defaults to `datePublished` when omitted. */
	dateModified?: string;
	authors?: ArticleAuthor[];
	/** Absolute URL of the lead image. */
	image?: string;
	keywords?: string[];
	publisher?: OrganizationInput;
}

/** Article (or BlogPosting/NewsArticle/ScholarlyArticle) for editorial pages. */
export function article(input: ArticleInput): JsonLdNode {
	const dateModified = input.dateModified ?? input.datePublished;
	return {
		"@context": CONTEXT,
		"@type": input.type ?? "Article",
		headline: input.headline,
		url: input.url,
		mainEntityOfPage: input.url,
		...(input.description ? { description: input.description } : {}),
		...(input.authors?.length
			? {
					author: input.authors.map((author) => ({
						"@type": "Person",
						name: author.name,
						...(author.url ? { url: author.url } : {}),
					})),
				}
			: {}),
		...(input.publisher ? { publisher: organizationNode(input.publisher) } : {}),
		...(input.datePublished ? { datePublished: input.datePublished } : {}),
		...(dateModified ? { dateModified } : {}),
		...(input.image ? { image: input.image } : {}),
		...(input.keywords?.length ? { keywords: input.keywords } : {}),
	};
}

// --- Person ----------------------------------------------------------------

export interface PersonInput {
	name: string;
	/** Absolute URL of the person's page/profile. */
	url?: string;
	jobTitle?: string;
	/** Employer: an Organization, or just its name. */
	worksFor?: OrganizationInput | string;
	/** Absolute URL of a portrait image. */
	image?: string;
	description?: string;
	email?: string;
	/** Profile/social URLs that corroborate the person. */
	sameAs?: string[];
	/** Home location place name, e.g. "Brussels, Belgium". */
	homeLocation?: string;
}

/** Person: identifies an individual as an entity (portfolio, team, author bios). */
export function person(input: PersonInput): JsonLdNode {
	const worksFor =
		typeof input.worksFor === "string"
			? { "@type": "Organization", name: input.worksFor }
			: input.worksFor
				? organizationNode(input.worksFor)
				: undefined;
	return {
		"@context": CONTEXT,
		"@type": "Person",
		name: input.name,
		...(input.url ? { url: input.url } : {}),
		...(input.jobTitle ? { jobTitle: input.jobTitle } : {}),
		...(worksFor ? { worksFor } : {}),
		...(input.image ? { image: input.image } : {}),
		...(input.description ? { description: input.description } : {}),
		...(input.email ? { email: input.email } : {}),
		...(input.sameAs?.length ? { sameAs: input.sameAs } : {}),
		...(input.homeLocation
			? { homeLocation: { "@type": "Place", name: input.homeLocation } }
			: {}),
	};
}

// --- LocalBusiness ---------------------------------------------------------

export interface PostalAddressInput {
	streetAddress?: string;
	addressLocality?: string;
	addressRegion?: string;
	postalCode?: string;
	/** ISO country code, e.g. "BE". */
	addressCountry?: string;
}

export interface GeoInput {
	latitude: number;
	longitude: number;
}

export interface AggregateRatingInput {
	ratingValue: string | number;
	reviewCount: string | number;
}

export interface LocalBusinessInput {
	name: string;
	/** Absolute URL of the business site. */
	url?: string;
	description?: string;
	/** Absolute image URL(s). */
	image?: string | string[];
	/** Absolute logo URL. */
	logo?: string;
	email?: string;
	telephone?: string;
	/** e.g. "€€". */
	priceRange?: string;
	openingHours?: string | string[];
	address?: PostalAddressInput;
	geo?: GeoInput;
	/** Map deep-link URL. */
	hasMap?: string;
	aggregateRating?: AggregateRatingInput;
	sameAs?: string[];
	/** schema.org LocalBusiness subtype, e.g. "Store", "ArtGallery". Default "LocalBusiness". */
	type?: string;
}

/** LocalBusiness (or a subtype): a physical business for local/maps SEO. */
export function localBusiness(input: LocalBusinessInput): JsonLdNode {
	return {
		"@context": CONTEXT,
		"@type": input.type ?? "LocalBusiness",
		name: input.name,
		...(input.url ? { url: input.url } : {}),
		...(input.description ? { description: input.description } : {}),
		...(input.image
			? { image: Array.isArray(input.image) ? input.image : [input.image] }
			: {}),
		...(input.logo ? { logo: input.logo } : {}),
		...(input.email ? { email: input.email } : {}),
		...(input.telephone ? { telephone: input.telephone } : {}),
		...(input.priceRange ? { priceRange: input.priceRange } : {}),
		...(input.openingHours ? { openingHours: input.openingHours } : {}),
		...(input.address
			? { address: { "@type": "PostalAddress", ...input.address } }
			: {}),
		...(input.geo
			? {
					geo: {
						"@type": "GeoCoordinates",
						latitude: input.geo.latitude,
						longitude: input.geo.longitude,
					},
				}
			: {}),
		...(input.hasMap ? { hasMap: input.hasMap } : {}),
		...(input.aggregateRating
			? {
					aggregateRating: {
						"@type": "AggregateRating",
						ratingValue: String(input.aggregateRating.ratingValue),
						reviewCount: String(input.aggregateRating.reviewCount),
					},
				}
			: {}),
		...(input.sameAs?.length ? { sameAs: input.sameAs } : {}),
	};
}

// --- Event -----------------------------------------------------------------

export interface EventLocationInput {
	name?: string;
	/** Postal address string or a URL for online events. */
	address?: string;
	/** Absolute URL (physical place page or online joining link). */
	url?: string;
	/** Set true for a fully virtual event (emits VirtualLocation). */
	online?: boolean;
}

export interface EventInput {
	name: string;
	/** ISO 8601 start, e.g. "2026-09-30" or "2026-09-30T09:00:00+02:00". */
	startDate: string;
	/** ISO 8601 end. Defaults to startDate. */
	endDate?: string;
	description?: string;
	/** Absolute URL of the event page. */
	url?: string;
	/** Absolute image URL(s). */
	image?: string | string[];
	location?: EventLocationInput;
	organizer?: OrganizationInput;
	offers?: OfferInput;
	/** Defaults to "https://schema.org/EventScheduled". */
	eventStatus?: string;
	attendanceMode?: "offline" | "online" | "mixed";
}

const ATTENDANCE_MODE: Record<string, string> = {
	offline: "https://schema.org/OfflineEventAttendanceMode",
	online: "https://schema.org/OnlineEventAttendanceMode",
	mixed: "https://schema.org/MixedEventAttendanceMode",
};

function eventLocationNode(location: EventLocationInput): JsonLdNode {
	if (location.online) {
		return {
			"@type": "VirtualLocation",
			...(location.url ? { url: location.url } : {}),
		};
	}
	return {
		"@type": "Place",
		...(location.name ? { name: location.name } : {}),
		...(location.address ? { address: location.address } : {}),
		...(location.url ? { url: location.url } : {}),
	};
}

/** Event: a scheduled happening (summit, workshop, conference) for event rich results. */
export function event(input: EventInput): JsonLdNode {
	return {
		"@context": CONTEXT,
		"@type": "Event",
		name: input.name,
		startDate: input.startDate,
		endDate: input.endDate ?? input.startDate,
		eventStatus: input.eventStatus ?? "https://schema.org/EventScheduled",
		...(input.attendanceMode
			? { eventAttendanceMode: ATTENDANCE_MODE[input.attendanceMode] }
			: {}),
		...(input.description ? { description: input.description } : {}),
		...(input.url ? { url: input.url } : {}),
		...(input.image
			? { image: Array.isArray(input.image) ? input.image : [input.image] }
			: {}),
		...(input.location ? { location: eventLocationNode(input.location) } : {}),
		...(input.organizer ? { organizer: organizationNode(input.organizer) } : {}),
		...(input.offers ? { offers: offerNode(input.offers) } : {}),
	};
}

// --- Factory ---------------------------------------------------------------

export interface SeoConfig {
	/** Absolute site origin, e.g. "https://example.com". */
	baseUrl: string;
	/** Shared publisher/provider, injected into article()/website()/organization(). */
	organization?: OrganizationInput;
}

/** A path-aware version of a crumb: `path` is resolved against the base URL. */
export interface BreadcrumbPath {
	name: string;
	path: string;
}

/**
 * Binds the builders to a site so callers pass site-relative paths instead of
 * absolute URLs, and the configured Organization is injected automatically.
 *
 * @example
 * const seo = createSeo({ baseUrl: getServerUrl(), organization: ORG });
 * <JsonLd data={seo.article({ path: `/blog/${slug}`, headline, datePublished })} />
 */
export function createSeo(config: SeoConfig) {
	const absolute = (path: string): string =>
		/^https?:\/\//.test(path) ? path : new URL(path, config.baseUrl).toString();

	return {
		/** Resolve a site-relative path to an absolute URL. */
		absolute,
		/** FAQPage (path-free). */
		faqPage,
		/** BreadcrumbList from site-relative paths. */
		breadcrumbs(items: BreadcrumbPath[]): JsonLdNode {
			return breadcrumbList(
				items.map((item) => ({ name: item.name, url: absolute(item.path) })),
			);
		},
		/** Organization from config (with optional per-call overrides). */
		organization(overrides?: Partial<OrganizationInput>): JsonLdNode {
			if (!config.organization) {
				throw new Error(
					"createSeo: organization() needs `organization` in config",
				);
			}
			return organization({ ...config.organization, ...overrides });
		},
		/** WebSite from config, defaulting name/url/publisher to the configured org. */
		website(input?: Partial<WebsiteInput>): JsonLdNode {
			const name = input?.name ?? config.organization?.name;
			if (!name) {
				throw new Error(
					"createSeo: website() needs a name or configured organization",
				);
			}
			return website({
				name,
				url: input?.url ?? config.baseUrl,
				publisher: input?.publisher ?? config.organization,
			});
		},
		/** SoftwareApplication; `path` (default "/") is resolved to an absolute URL. */
		softwareApplication(
			input: Omit<SoftwareApplicationInput, "url"> & { path?: string },
		): JsonLdNode {
			const { path, ...rest } = input;
			return softwareApplication({ ...rest, url: absolute(path ?? "/") });
		},
		/** Article; `path`/`image` are resolved and the configured org becomes publisher. */
		article(
			input: Omit<ArticleInput, "url" | "image" | "publisher"> & {
				path: string;
				image?: string;
				publisher?: OrganizationInput;
			},
		): JsonLdNode {
			const { path, image, publisher, ...rest } = input;
			return article({
				...rest,
				url: absolute(path),
				...(image ? { image: absolute(image) } : {}),
				publisher: publisher ?? config.organization,
			});
		},
	};
}

export type Seo = ReturnType<typeof createSeo>;
