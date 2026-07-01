# @ingram-tech/nk-seo

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
