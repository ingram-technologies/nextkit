---
"@ingram-tech/nk-seo": minor
---

New package: SEO primitives for Next.js sites. Ships typed schema.org JSON-LD
builders (`faqPage`, `breadcrumbList`, `article`, `softwareApplication`,
`organization`, `website`) plus a `createSeo` factory, a `createMetadata`
factory (canonical + OpenGraph + Twitter), and `<JsonLd>` / `<HreflangLinks>`
components. Consolidates the structured-data, metadata, and hreflang code that
ingram.tech, malinamore.studio, and financica each re-implemented.
