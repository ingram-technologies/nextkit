import { absoluteUrl } from "./url.js";

/**
 * Typed schema.org JSON-LD builders. Each returns a typed node ready to hand
 * to `<JsonLd>` (from "@ingram-tech/nk-seo/components").
 *
 * The standalone builders take values as-is: pass **absolute** URLs for
 * `url`/`image`/`logo` fields. If your pages work in site-relative paths and
 * share one Organization, prefer {@link createSeo}, which resolves paths against
 * a base URL (including nested `logo`/`offers.url` fields) and injects the
 * publisher/provider for you.
 */

const CONTEXT = "https://schema.org";

/** A loosely-typed schema.org node. The builders return more precise subtypes. */
export type JsonLdNode = Record<string, unknown>;

/**
 * Escape hatch carried by every builder input: properties shallow-merged over
 * the built payload (they win on conflict). schema.org is far larger than any
 * builder surface, and without this one extra property — an `inLanguage`, an
 * `about`, a `potentialAction` — forces the whole node back to a hand-written
 * literal. Fields passed here are not reflected in the returned node type.
 */
export interface WithExtra {
	extra?: JsonLdNode;
}

/** A top-level schema.org node: the payload plus its `@context`. */
export type WithContext<T> = T & { "@context": "https://schema.org" };

// --- FAQPage ---------------------------------------------------------------

export interface FaqItem {
	question: string;
	answer: string;
}

export type QuestionNode = {
	"@type": "Question";
	name: string;
	acceptedAnswer: { "@type": "Answer"; text: string };
};

export type FaqPageNode = {
	"@type": "FAQPage";
	mainEntity: QuestionNode[];
};

/** FAQPage: marks up a list of question/answer pairs for FAQ rich results. */
export function faqPage(
	items: FaqItem[],
	extra?: JsonLdNode,
): WithContext<FaqPageNode> {
	return {
		"@context": CONTEXT,
		"@type": "FAQPage",
		mainEntity: items.map((item) => ({
			"@type": "Question",
			name: item.question,
			acceptedAnswer: { "@type": "Answer", text: item.answer },
		})),
		...extra,
	};
}

// --- BreadcrumbList --------------------------------------------------------

export interface BreadcrumbItem {
	name: string;
	/** Absolute URL of the crumb. */
	url: string;
}

export type ListItemNode = {
	"@type": "ListItem";
	position: number;
	name: string;
	item: string;
};

export type BreadcrumbListNode = {
	"@type": "BreadcrumbList";
	itemListElement: ListItemNode[];
};

/** BreadcrumbList: the trail of links Google shows in place of the raw URL. */
export function breadcrumbList(
	items: BreadcrumbItem[],
	extra?: JsonLdNode,
): WithContext<BreadcrumbListNode> {
	return {
		"@context": CONTEXT,
		"@type": "BreadcrumbList",
		itemListElement: items.map((item, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: item.name,
			item: item.url,
		})),
		...extra,
	};
}

// --- Organization ----------------------------------------------------------

export interface OrganizationInput extends WithExtra {
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

export type PostalAddressNode = { "@type": "PostalAddress" } & PostalAddressInput;

export type ImageObjectNode = { "@type": "ImageObject"; url: string };

export type OrganizationNode = {
	"@type": "Organization";
	name: string;
	url?: string;
	logo?: ImageObjectNode;
	description?: string;
	email?: string;
	telephone?: string;
	address?: PostalAddressNode;
	sameAs?: string[];
};

/** Organization node without `@context`, for embedding as publisher/provider. */
function organizationNode(input: OrganizationInput): OrganizationNode {
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
		...input.extra,
	};
}

/** Organization: the entity behind the site (for the knowledge panel). */
export function organization(input: OrganizationInput): WithContext<OrganizationNode> {
	return { "@context": CONTEXT, ...organizationNode(input) };
}

// --- WebSite ---------------------------------------------------------------

export interface WebsiteInput extends WithExtra {
	name: string;
	/** Absolute URL of the site root. */
	url: string;
	publisher?: OrganizationInput;
}

export type WebsiteNode = {
	"@type": "WebSite";
	name: string;
	url: string;
	publisher?: OrganizationNode;
};

/** WebSite: identifies the site as an entity; pair with {@link organization}. */
export function website(input: WebsiteInput): WithContext<WebsiteNode> {
	return {
		"@context": CONTEXT,
		"@type": "WebSite",
		name: input.name,
		url: input.url,
		...(input.publisher ? { publisher: organizationNode(input.publisher) } : {}),
		...input.extra,
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

export type OfferNode = {
	"@type": "Offer";
	priceCurrency: string;
	price?: string;
	url?: string;
};

export type AggregateOfferNode = {
	"@type": "AggregateOffer";
	priceCurrency: string;
	lowPrice?: string;
	highPrice?: string;
	offerCount?: string;
	url?: string;
};

function offerNode(offer: OfferInput): OfferNode | AggregateOfferNode {
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

export interface SoftwareApplicationInput extends WithExtra {
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

export type SoftwareApplicationNode = {
	"@type": "SoftwareApplication";
	name: string;
	applicationCategory?: string;
	operatingSystem?: string;
	url?: string;
	description?: string;
	offers?: OfferNode | AggregateOfferNode;
};

/** SoftwareApplication: marks a product page as an app for rich results. */
export function softwareApplication(
	input: SoftwareApplicationInput,
): WithContext<SoftwareApplicationNode> {
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
		...input.extra,
	};
}

// --- Article ---------------------------------------------------------------

/**
 * schema.org Article subtypes worth marking up. `TechArticle` is the right node
 * for API/developer docs (`proficiencyLevel`/`dependencies` via `extra`).
 */
export type ArticleType =
	| "Article"
	| "BlogPosting"
	| "NewsArticle"
	| "ScholarlyArticle"
	| "TechArticle"
	| "Report";

export interface ArticleAuthor {
	name: string;
	/** Absolute URL of the author's profile/page. */
	url?: string;
}

export interface ArticleInput extends WithExtra {
	headline: string;
	/** Absolute canonical URL of the article. */
	url: string;
	description?: string;
	type?: ArticleType;
	datePublished?: string;
	/** Defaults to `datePublished` when omitted. */
	dateModified?: string;
	authors?: ArticleAuthor[];
	/** Absolute URL of the lead image. */
	image?: string;
	keywords?: string[];
	publisher?: OrganizationInput;
}

export type ArticleAuthorNode = { "@type": "Person"; name: string; url?: string };

export type ArticleNode = {
	"@type": ArticleType;
	headline: string;
	url: string;
	mainEntityOfPage: string;
	description?: string;
	author?: ArticleAuthorNode[];
	publisher?: OrganizationNode;
	datePublished?: string;
	dateModified?: string;
	image?: string;
	keywords?: string[];
};

/** Article (or one of its {@link ArticleType} subtypes) for editorial pages. */
export function article(input: ArticleInput): WithContext<ArticleNode> {
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
						"@type": "Person" as const,
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
		...input.extra,
	};
}

// --- Person ----------------------------------------------------------------

export interface PersonInput extends WithExtra {
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

export type PersonNode = {
	"@type": "Person";
	name: string;
	url?: string;
	jobTitle?: string;
	worksFor?: OrganizationNode;
	image?: string;
	description?: string;
	email?: string;
	sameAs?: string[];
	homeLocation?: { "@type": "Place"; name: string };
};

/** Person: identifies an individual as an entity (portfolio, team, author bios). */
export function person(input: PersonInput): WithContext<PersonNode> {
	const worksFor =
		typeof input.worksFor === "string"
			? organizationNode({ name: input.worksFor })
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
			? { homeLocation: { "@type": "Place" as const, name: input.homeLocation } }
			: {}),
		...input.extra,
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

export interface LocalBusinessInput extends WithExtra {
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

export type GeoCoordinatesNode = {
	"@type": "GeoCoordinates";
	latitude: number;
	longitude: number;
};

export type AggregateRatingNode = {
	"@type": "AggregateRating";
	ratingValue: string;
	reviewCount: string;
};

export type LocalBusinessNode = {
	/** "LocalBusiness" or the subtype passed as `type`. */
	"@type": string;
	name: string;
	url?: string;
	description?: string;
	image?: string[];
	logo?: string;
	email?: string;
	telephone?: string;
	priceRange?: string;
	openingHours?: string | string[];
	address?: PostalAddressNode;
	geo?: GeoCoordinatesNode;
	hasMap?: string;
	aggregateRating?: AggregateRatingNode;
	sameAs?: string[];
};

/** LocalBusiness (or a subtype): a physical business for local/maps SEO. */
export function localBusiness(
	input: LocalBusinessInput,
): WithContext<LocalBusinessNode> {
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
		...input.extra,
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

export interface EventInput extends WithExtra {
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

export type PlaceNode = {
	"@type": "Place";
	name?: string;
	address?: string;
	url?: string;
};

export type VirtualLocationNode = { "@type": "VirtualLocation"; url?: string };

export type EventNode = {
	"@type": "Event";
	name: string;
	startDate: string;
	endDate: string;
	eventStatus: string;
	eventAttendanceMode?: string;
	description?: string;
	url?: string;
	image?: string[];
	location?: PlaceNode | VirtualLocationNode;
	organizer?: OrganizationNode;
	offers?: OfferNode | AggregateOfferNode;
};

const ATTENDANCE_MODE: Record<NonNullable<EventInput["attendanceMode"]>, string> = {
	offline: "https://schema.org/OfflineEventAttendanceMode",
	online: "https://schema.org/OnlineEventAttendanceMode",
	mixed: "https://schema.org/MixedEventAttendanceMode",
};

function eventLocationNode(
	location: EventLocationInput,
): PlaceNode | VirtualLocationNode {
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
export function event(input: EventInput): WithContext<EventNode> {
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
		...input.extra,
	};
}

// --- Dataset ---------------------------------------------------------------

export interface DataDownloadInput {
	/** Absolute URL of the file/endpoint. */
	contentUrl: string;
	/** IANA media type or a format name, e.g. "text/csv", "application/json". */
	encodingFormat?: string;
	name?: string;
}

export interface DatasetInput extends WithExtra {
	name: string;
	description: string;
	/** Absolute URL of the dataset's landing page. */
	url?: string;
	/** Stable identifier(s): DOI, URI, registry code. */
	identifier?: string | string[];
	/** License URL, e.g. "https://creativecommons.org/licenses/by/4.0/". */
	license?: string;
	keywords?: string[];
	/** BCP 47 language tag(s) of the dataset's contents. */
	inLanguage?: string | string[];
	/** ISO 8601 interval, e.g. "2008-01-01/2025-12-31". */
	temporalCoverage?: string;
	/** Place name or ISO country code the data covers. */
	spatialCoverage?: string;
	dateModified?: string;
	/** Downloadable distributions of the data. */
	distribution?: DataDownloadInput[];
	/** Google shows a free-access badge; omit rather than guess. */
	isAccessibleForFree?: boolean;
	creator?: OrganizationInput;
	publisher?: OrganizationInput;
}

export type DataDownloadNode = {
	"@type": "DataDownload";
	contentUrl: string;
	encodingFormat?: string;
	name?: string;
};

export type DatasetNode = {
	"@type": "Dataset";
	name: string;
	description: string;
	url?: string;
	identifier?: string | string[];
	license?: string;
	keywords?: string[];
	inLanguage?: string | string[];
	temporalCoverage?: string;
	spatialCoverage?: string;
	dateModified?: string;
	distribution?: DataDownloadNode[];
	isAccessibleForFree?: boolean;
	creator?: OrganizationNode;
	publisher?: OrganizationNode;
};

/** Dataset: a published data collection, for Google's dataset search. */
export function dataset(input: DatasetInput): WithContext<DatasetNode> {
	return {
		"@context": CONTEXT,
		"@type": "Dataset",
		name: input.name,
		description: input.description,
		...(input.url ? { url: input.url } : {}),
		...(input.identifier ? { identifier: input.identifier } : {}),
		...(input.license ? { license: input.license } : {}),
		...(input.keywords?.length ? { keywords: input.keywords } : {}),
		...(input.inLanguage ? { inLanguage: input.inLanguage } : {}),
		...(input.temporalCoverage ? { temporalCoverage: input.temporalCoverage } : {}),
		...(input.spatialCoverage ? { spatialCoverage: input.spatialCoverage } : {}),
		...(input.dateModified ? { dateModified: input.dateModified } : {}),
		...(input.distribution?.length
			? {
					distribution: input.distribution.map((item) => ({
						"@type": "DataDownload" as const,
						contentUrl: item.contentUrl,
						...(item.encodingFormat
							? { encodingFormat: item.encodingFormat }
							: {}),
						...(item.name ? { name: item.name } : {}),
					})),
				}
			: {}),
		...(input.isAccessibleForFree !== undefined
			? { isAccessibleForFree: input.isAccessibleForFree }
			: {}),
		...(input.creator ? { creator: organizationNode(input.creator) } : {}),
		...(input.publisher ? { publisher: organizationNode(input.publisher) } : {}),
		...input.extra,
	};
}

// --- DefinedTerm / DefinedTermSet -------------------------------------------

export interface DefinedTermSetInput extends WithExtra {
	name: string;
	/** Absolute URL of the set's landing page. */
	url?: string;
	description?: string;
	/** Version/edition of the vocabulary, e.g. "2025". */
	version?: string;
	inLanguage?: string | string[];
}

export type DefinedTermSetNode = {
	"@type": "DefinedTermSet";
	name: string;
	url?: string;
	description?: string;
	version?: string;
	inLanguage?: string | string[];
};

/** DefinedTermSet node without `@context`, for embedding as inDefinedTermSet. */
function definedTermSetNode(input: DefinedTermSetInput): DefinedTermSetNode {
	return {
		"@type": "DefinedTermSet",
		name: input.name,
		...(input.url ? { url: input.url } : {}),
		...(input.description ? { description: input.description } : {}),
		...(input.version ? { version: input.version } : {}),
		...(input.inLanguage ? { inLanguage: input.inLanguage } : {}),
		...input.extra,
	};
}

/** DefinedTermSet: the vocabulary/classification a term belongs to. */
export function definedTermSet(
	input: DefinedTermSetInput,
): WithContext<DefinedTermSetNode> {
	return { "@context": CONTEXT, ...definedTermSetNode(input) };
}

export interface DefinedTermInput extends WithExtra {
	name: string;
	description?: string;
	/** Absolute URL of the term's own page. */
	url?: string;
	/** The code identifying the term inside its set, e.g. "62.01". */
	termCode?: string;
	inLanguage?: string | string[];
	/** The vocabulary this term belongs to — its absolute URL, or a full set. */
	inDefinedTermSet?: string | DefinedTermSetInput;
}

export type DefinedTermNode = {
	"@type": "DefinedTerm";
	name: string;
	description?: string;
	url?: string;
	termCode?: string;
	inLanguage?: string | string[];
	inDefinedTermSet?: string | DefinedTermSetNode;
};

/** DefinedTerm: one entry of a controlled vocabulary or classification. */
export function definedTerm(input: DefinedTermInput): WithContext<DefinedTermNode> {
	const set =
		typeof input.inDefinedTermSet === "string"
			? input.inDefinedTermSet
			: input.inDefinedTermSet
				? definedTermSetNode(input.inDefinedTermSet)
				: undefined;
	return {
		"@context": CONTEXT,
		"@type": "DefinedTerm",
		name: input.name,
		...(input.description ? { description: input.description } : {}),
		...(input.url ? { url: input.url } : {}),
		...(input.termCode ? { termCode: input.termCode } : {}),
		...(input.inLanguage ? { inLanguage: input.inLanguage } : {}),
		...(set ? { inDefinedTermSet: set } : {}),
		...input.extra,
	};
}

// --- Factory ---------------------------------------------------------------

export interface SeoConfig {
	/** Absolute site origin, e.g. "https://acme.example". */
	baseUrl: string;
	/**
	 * Shared publisher/provider, injected into article()/website()/organization().
	 * Its `url` and `logo` may be site-relative — they are resolved against
	 * `baseUrl`.
	 */
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
 * Nested URL fields (`organization.url`/`logo`, `offers.url`, article `image`)
 * are resolved too — JSON-LD must never ship relative URLs.
 *
 * @example
 * const seo = createSeo({ baseUrl: getServerUrl(), organization: ORG });
 * <JsonLd data={seo.article({ path: `/blog/${slug}`, headline, datePublished })} />
 */
export function createSeo(config: SeoConfig) {
	const absolute = (path: string): string => absoluteUrl(path, config.baseUrl);

	const resolveOrg = (org: OrganizationInput): OrganizationInput => ({
		...org,
		...(org.url ? { url: absolute(org.url) } : {}),
		...(org.logo ? { logo: absolute(org.logo) } : {}),
	});

	const resolveOffers = (offers: OfferInput): OfferInput => ({
		...offers,
		...(offers.url ? { url: absolute(offers.url) } : {}),
	});

	return {
		/** Resolve a site-relative path to an absolute URL. */
		absolute,
		/** FAQPage (path-free). */
		faqPage,
		/** BreadcrumbList from site-relative paths. */
		breadcrumbs(items: BreadcrumbPath[]): WithContext<BreadcrumbListNode> {
			return breadcrumbList(
				items.map((item) => ({ name: item.name, url: absolute(item.path) })),
			);
		},
		/** Organization from config (with optional per-call overrides). */
		organization(
			overrides?: Partial<OrganizationInput>,
		): WithContext<OrganizationNode> {
			if (!config.organization) {
				throw new Error(
					"createSeo: organization() needs `organization` in config",
				);
			}
			return organization(resolveOrg({ ...config.organization, ...overrides }));
		},
		/** WebSite from config, defaulting name/url/publisher to the configured org. */
		website(input?: Partial<WebsiteInput>): WithContext<WebsiteNode> {
			const name = input?.name ?? config.organization?.name;
			if (!name) {
				throw new Error(
					"createSeo: website() needs a name or configured organization",
				);
			}
			const publisher = input?.publisher ?? config.organization;
			return website({
				name,
				url: absolute(input?.url ?? config.baseUrl),
				...(publisher ? { publisher: resolveOrg(publisher) } : {}),
			});
		},
		/** SoftwareApplication; `path` (default "/") and `offers.url` are resolved. */
		softwareApplication(
			input: Omit<SoftwareApplicationInput, "url"> & { path?: string },
		): WithContext<SoftwareApplicationNode> {
			const { path, offers, ...rest } = input;
			return softwareApplication({
				...rest,
				url: absolute(path ?? "/"),
				...(offers ? { offers: resolveOffers(offers) } : {}),
			});
		},
		/** Article; `path`/`image` are resolved and the configured org becomes publisher. */
		article(
			input: Omit<ArticleInput, "url" | "image" | "publisher"> & {
				path: string;
				image?: string;
				publisher?: OrganizationInput;
			},
		): WithContext<ArticleNode> {
			const { path, image, publisher, ...rest } = input;
			const resolvedPublisher = publisher ?? config.organization;
			return article({
				...rest,
				url: absolute(path),
				...(image ? { image: absolute(image) } : {}),
				...(resolvedPublisher
					? { publisher: resolveOrg(resolvedPublisher) }
					: {}),
			});
		},
		/** Dataset; `path` is resolved and the configured org becomes publisher. */
		dataset(
			input: Omit<DatasetInput, "url" | "publisher"> & {
				path?: string;
				publisher?: OrganizationInput;
			},
		): WithContext<DatasetNode> {
			const { path, publisher, ...rest } = input;
			const resolvedPublisher = publisher ?? config.organization;
			return dataset({
				...rest,
				...(path ? { url: absolute(path) } : {}),
				...(resolvedPublisher
					? { publisher: resolveOrg(resolvedPublisher) }
					: {}),
			});
		},
		/** DefinedTerm; `path` and the term set's `path` are resolved. */
		definedTerm(
			input: Omit<DefinedTermInput, "url" | "inDefinedTermSet"> & {
				path?: string;
				inDefinedTermSet?:
					| string
					| (Omit<DefinedTermSetInput, "url"> & { path?: string });
			},
		): WithContext<DefinedTermNode> {
			const { path, inDefinedTermSet, ...rest } = input;
			let set: DefinedTermInput["inDefinedTermSet"];
			if (typeof inDefinedTermSet === "string") {
				set = absolute(inDefinedTermSet);
			} else if (inDefinedTermSet) {
				const { path: setPath, ...setRest } = inDefinedTermSet;
				set = { ...setRest, ...(setPath ? { url: absolute(setPath) } : {}) };
			}
			return definedTerm({
				...rest,
				...(path ? { url: absolute(path) } : {}),
				...(set ? { inDefinedTermSet: set } : {}),
			});
		},
	};
}

export type Seo = ReturnType<typeof createSeo>;
