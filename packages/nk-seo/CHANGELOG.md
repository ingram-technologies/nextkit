# @ingram-tech/nk-seo

## 0.6.0

### Minor Changes

- 6b188c2: Fix the hreflang/canonical slice and close a URL origin escape:

  - **`absoluteUrl` throws when the input escapes the site origin.** A request to `https://site//evil.com/x` puts `//evil.com/x` into `req.nextUrl.pathname` and thus into `x-pathname`; the old pass-through resolved it to `https://evil.com/x` and emitted it as the canonical — an SEO-hijack primitive once cached. Backslash forms and scheme'd inputs (`javascript:`) are rejected the same way.
  - **The canonical now self-references per Google's spec.** A localized variant that canonicalizes to another URL makes Google discard the whole hreflang cluster. The prefix strategy auto-detects the current locale from the pathname; the query strategy accepts a new `currentLocale` option (the server can't see the query string).
  - **The prefix strategy no longer double-prefixes.** `x-pathname` carries the real `/fr/about` on a localized route; alternates were computed as `/en/fr/about` + `/fr/fr/about`. An existing locale prefix is now stripped first. `strategy: "prefix"` without `defaultLocale` throws at call time instead of silently emitting URLs no locale serves.
  - **The documented middleware snippet actually works now.** It set `x-pathname` on the _response_; `headers()` reads _request_ headers, so `<HreflangLinks>` threw on every request — and its error message repeated the same broken snippet. README, JSDoc, and the error message all show the `NextResponse.next({ request: { headers } })` form, note that copying `req.headers` first neutralizes client spoofing, and document the static-rendering tradeoff of the header path.
  - `noIndex: true` emits `follow: true` (noindex pages should still pass link equity); query URLs append with `&` when the path already carries a query; duplicate React keys can no longer silently drop alternate links; the README's peer-dependency claim covers `/og` (which needs both `next` and `react` at runtime).

## 0.5.0

### Minor Changes

- a3e2517: Harden and round out the SEO primitives.

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

- 220104b: Add sitemap, robots, and Open Graph image helpers.

  - `createSitemap({ baseUrl, routes })` builds a `MetadataRoute.Sitemap` for
    `app/sitemap.ts`, resolving relative paths against your origin ("/" → priority
    1, others → 0.7 by default; per-route overrides supported).
  - `createRobots({ baseUrl, isProduction, disallow })` builds a
    `MetadataRoute.Robots` for `app/robots.ts` and blanket-disallows non-production
    hosts, so Vercel preview / branch deployments never get indexed and dilute the
    production domain.
  - `ogImageResponse(options)` on the new `@ingram-tech/nk-seo/og` entry renders a
    branded `next/og` share card, encoding the Satori "explicit `display: flex` on
    multi-child nodes" rule so titles stay plain strings and the accent rides on
    the mark. Kept on its own entry so the root and `/components` never import
    `next/og`.

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
  Next.js sites each re-implemented.
