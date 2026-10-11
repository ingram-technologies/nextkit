---
"@ingram-tech/nk-blog": patch
---

A trailing slash on `baseUrl` (SEO helpers) or `siteUrl` (`generateRss`) no
longer produces `//` in generated URLs. `https://example.com/` used to give
`https://example.com//blog/<slug>` in post URLs, canonicals, alternates,
JSON-LD, breadcrumbs and the RSS item links and guids.
