# @ingram-tech/nk-seo

## 0.10.1

### Patch Changes

- 798b39d: Rewrite the READMEs for an outside reader. These packages are published under an
  open-source licence, but the prose addressed the reader as if they worked here:
  "the Ingram billing foundation", "every Ingram API looks the same", "the one
  shared email client for Ingram sites", "the fleet-uniform view". That framing is
  gone, along with the pose it came with — unsourceable claims ("the one SEO
  safeguard everyone forgets on Vercel"), negation-reframes, bold scattered on
  non-key phrases, and roughly forty mid-sentence em-dashes.
  
  Documented failure modes, gotchas and code examples are unchanged. No API,
  identifier, env var or technical claim was touched.

## 0.10.0

### Minor Changes

- a589e0b: nk-seo: `createMetadata({ hreflang })` emits the locale cluster from metadata. Set it once on the site config (the nk-i18n routing object fits directly) and every `pageMetadata()` call gains `alternates.languages` (with `x-default`) and a canonical that follows the address; pass `urlLocale` on dynamic pages so a localized URL canonicalizes to itself. Because this goes through metadata rather than the `x-pathname` request header, it works on statically rendered routes (`force-static`), where `<HreflangLinks>` has no header to read and throws — the READMEs now say so and point at the metadata wiring as the preferred one. nk-i18n: docs only.

## 0.9.0

### Minor Changes

- c9307ad: Fix the locale cluster shape, and give middleware one way to be written.
  
  **Breaking, deliberately.** `prefixDefaultLocale` is removed and nothing
  replaces it: the cluster's shape is no longer configurable. Whichever strategy
  you pick, every locale gets its own address (the default included) and the bare
  path belongs to no locale — it negotiates, and it is `x-default`.
  
  Previously the prefix strategy made the bare path the default locale's URL, so
  `localeFromUrl` returned `defaultLocale` for it. That is the URL signal, which
  outranks the cookie, so a visitor who chose French snapped back to English on
  the first bare internal link — and every site that starts with a cookie switcher
  has bare internal links. The two shapes now excluded (bare path IS the default
  locale, bare path redirects on perceived language) are the two that go wrong;
  offering either as an option is how a fleet drifts.
  
  - **`localeProxy(routing, request)`** is the whole middleware side: forwards the
    pathname and locale headers, rewrites `/fr/about` → `/about` so the app keeps
    one route tree, remembers an explicit choice in the cookie, never redirects.
    Middleware that does more passes `requestHeaders` in and keeps editing the
    response. Replaces `forwardUrlLocale` and the strip/rewrite/cookie/consolidate
    code every prefix site was hand-writing.
  - **`forwardRequestContext`** sets nk-seo's `x-pathname` and the locale header
    together, so the two conventions can't be wired separately and one forgotten.
  - **`defineLocaleRouting` is generic over the locale union.** `isLocale` is a
    type guard, `resolve` / `localeFromUrl` / `createLocaleResolver` return `L`.
    Sites stop writing their own guards and casts.
  - **`hrefLangTags` and `cookieName` move onto routing.** A site with regional
    tags no longer builds a second config object, which was exactly the drift this
    package exists to prevent. `routing.htmlLang(locale)` gives the `<html lang>`
    value, and `hreflangConfigFor` passes the tags through.
  - **`routing.stripLocale(pathname)`** exposes the app-facing path.
  
  nk-seo's `HreflangConfig` drops `defaultLocale` and `prefixDefaultLocale`;
  `x-default` is always the bare path now, so neither is needed.
  
  Migration: delete `prefixDefaultLocale`, replace `forwardUrlLocale` +
  manual `x-pathname` with `localeProxy`, drop any local `isLocale` guard and
  `as Locale` cast. Prefix sites gain `/en/…` as a real address — verify with
  `assertHreflangCluster` from `@ingram-tech/nk-seo/verify`.

## 0.8.1

### Patch Changes

- 9262afb: Publish `src/` alongside `dist/`, so the emitted `.js.map` and `.d.ts.map` files
  resolve. Bundlers no longer warn that "sourcemap points to missing source
  files", stack traces map back to real TypeScript, and go-to-definition lands on
  the annotated source instead of a generated `.d.ts`. Tests are excluded from the
  tarball.

## 0.8.0

### Minor Changes

- 8503c09: Fix the self-referencing canonical for the `"query"` hreflang strategy, and add
  `@ingram-tech/nk-seo/verify`.
  
  `hreflangAlternates` treated "default locale" and "bare path" as the same thing,
  which only holds for the `"prefix"` strategy. Under `"query"` every locale has
  its own `?hl=` address and the bare path is the negotiating `x-default`, so
  `?hl=en` was canonicalizing away to the bare path and deleting the default
  locale from its own cluster. It now canonicalizes to itself. Prefix behaviour is
  unchanged.
  
  **This changes emitted canonical URLs for query-strategy sites that pass
  `currentLocale`.** That is the point, but re-crawl expectations accordingly.
  
  `verify` adds `verifyHreflangCluster` / `assertHreflangCluster`, which fetch
  every advertised URL and fail on one that redirects, is not 200, canonicalizes
  elsewhere, has no or duplicate canonicals, is non-reciprocal, or serves an
  `<html lang>` contradicting its `hreflang`. hreflang is a set of promises about
  other URLs; nothing local can tell you whether they hold.

## 0.7.0

### Minor Changes

- d77e323: Make the package usable on localized sites and on nodes the builders don't
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

## 0.6.2

### Patch Changes

- a98f265: Test files are now type-checked. Every package excluded `**/*.test.ts` from the
  one tsconfig it used for both building and type-checking, so `tsc` never looked
  at a single test — and vitest strips types without checking them, so nothing
  did. Type-level assertions in tests were silently dead.

  `tsconfig.json` now excludes only `node_modules` and `dist` (and is what
  `type-check` and your editor use); the new `tsconfig.build.json` adds the test
  globs back, so `dist` still ships no tests.

  Fixing the 49 errors this surfaced was mostly mechanical (missing `.js`
  extensions on relative imports, which the NodeNext base config has always
  required), but three were real:

  - **nk-auth** `migrations.test.ts` passed `migrationsTable`, which is not a
    `PgliteServerOptions` key and was silently ignored — the test applied its
    migration chain twice, once as a dependency chain and again as the default app
    chain. It now stubs the primary applier so it tests the shape it documents.
  - **nk-seo** `metadata.test.ts` read `.type` off the `OpenGraph` union, where it
    is only present on the variants.
  - **nk-i18n**'s missing-key tests pass keys an empty catalog types as `never`.
    They exercise the runtime missing-key policy, which exists for catalogs that
    drift at runtime, so they now carry an explicit `@ts-expect-error`.

## 0.6.1

### Patch Changes

- 246e91d: `createRobots` now throws if a `disallow` entry would block `/_next`. Crawlers
  must fetch the JS/CSS under `/_next` to render pages, so disallowing it silently
  degrades indexing — Next.js does not block it by default and neither should a
  site. The guard is a prefix check (`/_next`, `/_next/`, `_next/static`, …); an
  unrelated prefix like `/_preview` is unaffected.

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
