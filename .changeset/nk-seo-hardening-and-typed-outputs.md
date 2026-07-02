---
"@ingram-tech/nk-seo": minor
---

Harden and round out the SEO primitives.

- `<JsonLd>` now escapes `<` (and U+2028/U+2029) when serializing, so a
  CMS-sourced string containing `</script>` can no longer terminate the script
  tag. The pure `serializeJsonLd` is exported from `/components`.
- Builders return typed nodes (`FaqPageNode`, `ArticleNode`,
  `WithContext<T>`, …) instead of `Record<string, unknown>`, so output shapes
  survive past the call site. `JsonLdNode` remains for compatibility.
- `createSeo` resolves **nested** relative URLs: the configured organization's
  `url`/`logo` (everywhere it's injected) and `offers.url` in
  `softwareApplication()`. Previously a relative `offers.url` shipped verbatim
  into the JSON-LD.
- `createMetadata`: new `titleTemplate` site option and `pageMetadata.root()`
  for the root layout (emits `metadataBase`, `title.default` + `title.template`);
  page metadata now also carries `metadataBase`.
- `createSitemap`: per-route `languages` map emits `alternates.languages`
  (resolved against `baseUrl`); a `priority` outside 0–1 now throws instead of
  emitting an invalid sitemap.
- `createRobots` no longer emits `host` — a deprecated Yandex-only directive
  that also expected a bare hostname, not an origin URL.
- `<HreflangLinks>` throws when neither `pathname` nor the `x-pathname` header
  is available, instead of silently canonicalizing every page to "/". The pure
  `hreflangAlternates(config, pathname)` is exported from the package root for
  `generateMetadata`-style use, and URL joining no longer produces `//` when
  `baseUrl` has a trailing slash.
- `ogImageResponse`: new `logo` (image mark), `fonts` (forwarded to
  `ImageResponse`), and `fontFamily` options; the template is render-tested
  through the real satori + resvg pipeline in CI.
- `sideEffects: false` for better tree-shaking.
