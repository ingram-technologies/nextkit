// Server entry: pure schema.org builders + the Metadata factory. No React, so
// route handlers / sitemap.ts can import these without pulling in the renderer.
// The <JsonLd> and <HreflangLinks> components live at
// "@ingram-tech/nk-seo/components".
export {
	type AggregateRatingInput,
	article,
	type ArticleAuthor,
	type ArticleInput,
	breadcrumbList,
	type BreadcrumbItem,
	type BreadcrumbPath,
	createSeo,
	event,
	type EventInput,
	type EventLocationInput,
	faqPage,
	type FaqItem,
	type GeoInput,
	type JsonLdNode,
	localBusiness,
	type LocalBusinessInput,
	type OfferInput,
	organization,
	type OrganizationInput,
	person,
	type PersonInput,
	type PostalAddressInput,
	type Seo,
	type SeoConfig,
	softwareApplication,
	type SoftwareApplicationInput,
	website,
	type WebsiteInput,
} from "./schema.js";
export {
	createMetadata,
	type MetadataSiteConfig,
	type PageMetadata,
	type PageMetadataInput,
} from "./metadata.js";
export {
	createRobots,
	createSitemap,
	type RobotsConfig,
	type SitemapConfig,
	type SitemapRoute,
} from "./routes.js";
