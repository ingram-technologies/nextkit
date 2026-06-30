// Server entry: pure schema.org builders + the Metadata factory. No React, so
// route handlers / sitemap.ts can import these without pulling in the renderer.
// The <JsonLd> and <HreflangLinks> components live at
// "@ingram-tech/nk-seo/components".
export {
	article,
	type ArticleAuthor,
	type ArticleInput,
	breadcrumbList,
	type BreadcrumbItem,
	type BreadcrumbPath,
	createSeo,
	faqPage,
	type FaqItem,
	type JsonLdNode,
	type OfferInput,
	organization,
	type OrganizationInput,
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
