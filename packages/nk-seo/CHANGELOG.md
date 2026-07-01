# @ingram-tech/nk-seo

## 0.4.0

### Minor Changes

- `organization()` now accepts optional `address` (PostalAddress) and `telephone`,
  so a company with a real office address can emit it on the Organization node
  (and, via `publisher`, on WebSite) without dropping to LocalBusiness.

## 0.3.0

### Minor Changes

- Add `person`, `localBusiness`, and `event` schema.org builders (with `Person`,
  `LocalBusiness` incl. address/geo/rating, and `Event` incl. attendance mode and
  virtual locations). Covers the entity types business/personal/event sites need
  beyond Organization/WebSite.

## 0.2.0

### Minor Changes

- a2a2c80: New package: SEO primitives for Next.js sites. Ships typed schema.org JSON-LD
  builders (`faqPage`, `breadcrumbList`, `article`, `softwareApplication`,
  `organization`, `website`) plus a `createSeo` factory, a `createMetadata`
  factory (canonical + OpenGraph + Twitter), and `<JsonLd>` / `<HreflangLinks>`
  components. Consolidates the structured-data, metadata, and hreflang code that
  ingram.tech, malinamore.studio, and financica each re-implemented.
