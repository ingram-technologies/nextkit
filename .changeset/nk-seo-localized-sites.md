---
"@ingram-tech/nk-seo": minor
---

Make the package usable on localized sites and on nodes the builders don't
cover, from four issues raised while migrating a 4-locale reference site.

- `createMetadata`: per-page `alternates` (merged over the generated
  `canonical`) and `locale` (overrides the site-wide OpenGraph locale). Both
  were previously unreachable, so localized sites had to spread-and-overwrite
  the factory's output — strictly worse than the hand-written object.
- `hreflangAlternates` / `<HreflangLinks>`: `prefixDefaultLocale` expresses the
  all-prefixed layout (`/en/about`, no bare path), with `x-default` pointing at
  the default locale's prefixed URL. The result also carries `languages`, the
  links keyed by hreflang, ready for `Metadata.alternates.languages`.
- Schema builders take an `extra` object, shallow-merged over the built payload,
  so one unsupported property no longer forces the whole node back to a literal.
  `article`'s `type` gains `TechArticle` and `Report`, and there are new
  `dataset`, `definedTerm` and `definedTermSet` builders (also on `createSeo`,
  with path resolution).
- New `ogImageMetadata` helper, plus README sections on the two silent ways a
  generated OG card fails to reach pages: a page's own `openGraph` replacing the
  inherited image, and locale-negotiating middleware redirecting a root-level
  `/opengraph-image`.
