# @ingram-tech/nk-i18n

## 0.5.1

### Patch Changes

- a589e0b: nk-seo: `createMetadata({ hreflang })` emits the locale cluster from metadata. Set it once on the site config (the nk-i18n routing object fits directly) and every `pageMetadata()` call gains `alternates.languages` (with `x-default`) and a canonical that follows the address; pass `urlLocale` on dynamic pages so a localized URL canonicalizes to itself. Because this goes through metadata rather than the `x-pathname` request header, it works on statically rendered routes (`force-static`), where `<HreflangLinks>` has no header to read and throws — the READMEs now say so and point at the metadata wiring as the preferred one. nk-i18n: docs only.
- 8cb32be: `LocaleRouting.hrefLangTags` and `hreflangConfigFor()`'s result keep the locale union (`L`) instead of widening to `string`; still assignable to nk-seo's `HreflangConfig`.

## 0.5.0

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

## 0.4.1

### Patch Changes

- 9262afb: Publish `src/` alongside `dist/`, so the emitted `.js.map` and `.d.ts.map` files
  resolve. Bundlers no longer warn that "sourcemap points to missing source
  files", stack traces map back to real TypeScript, and go-to-definition lands on
  the annotated source instead of a generated `.d.ts`. Tests are excluded from the
  tarball.

## 0.4.0

### Minor Changes

- 8503c09: Add locale URL routing: `defineLocaleRouting` (one definition of how a locale is
  encoded in a URL, shaped so it can be handed straight to nk-seo's
  `hreflangAlternates`), a fixed precedence chain (`LOCALE_PRECEDENCE`: URL →
  account → cookie → `Accept-Language` → country → default) with eager and lazy
  resolvers, and a `/next` subpath wiring it to middleware and server components
  (`forwardUrlLocale`, `getUrlLocale`, `createLocaleResolver`, `hreflangConfigFor`).
  
  The URL beating the account setting is deliberate and not configurable: a shared
  `?hl=fr` link must show the recipient French, or every localized link the site
  ships is a lie and so is the hreflang annotation pointing at it.
  
  See `docs/i18n-routing.md`.

## 0.3.4

### Patch Changes

- 2b21f3a: Routine runtime dependency bumps: `jose` 6.2.9 (nk-auth), `stripe` 22.5.0
  (nk-billing), `intl-messageformat` 11.2.14 (nk-i18n), and `@wrksz/themes` 1.2.0
  (nk-themes). No API changes in any of them — the `@wrksz/themes` minor is
  purely additive (new `./client/use-hydrated` and `./script` subpath exports,
  neither re-exported by nk-themes today).

## 0.3.3

### Patch Changes

- 6cf2320: Raise runtime dependency floors to the current patch/minor releases.

  `nk-auth` moves to `jose` ^6.2.6, `nk-billing` to `stripe` ^22.4.0, `nk-i18n` to
  `intl-messageformat` ^11.2.13, and `nk-dev` to `oxlint` ^1.76.0, `knip` ^6.31.0
  and `@testing-library/jest-dom` ^6.10.0.

  No API changes. `nk-dev` ships the toolchain as real dependencies, so its bump
  is what moves a consuming site's linter and dead-code checker — the new `oxlint`
  reported no findings against this repo.

## 0.3.2

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

## 0.3.1

### Patch Changes

- 8eec90d: Bump `intl-messageformat` to 11.2.12 (latest patch).

## 0.3.0

### Minor Changes

- 170ee9b: Implement the `MissingKeysPolicy` that was previously declared but inert.
  `createT` and `useT` now accept a `{ missingKeys }` option: `"error"` throws on
  a missing catalog entry, `"warn"` logs once per locale+key, and `"ignore"` (the
  default, and the prior behavior) falls back silently to the English key. Pass a
  locale's configured policy through, e.g.
  `createT(locale, msgs, undefined, { missingKeys: config.locales[locale].missingKeys })`.
  No behavior change unless you opt in.

### Patch Changes

- 170ee9b: `negotiateAcceptLanguage` now matches case-insensitively on the **supported**
  side too. It previously lowercased the header's primary subtag but compared it
  against the raw `supported` array, so an entry with any uppercase or region
  qualifier (`"EN"`, `"en-US"`) never matched despite the documented
  case-insensitive contract. Both sides are now normalized on the primary subtag,
  and the matching `supported` entry is returned verbatim (its own casing).

## 0.2.0

### Minor Changes

- 637972f: `Translator` (the `t()` returned by `createT`/`useT`) now returns a branded `LocalizedString` instead of a plain `string`, and the type is exported. The brand is erased at runtime and `LocalizedString` is assignable to `string`, so this is backward-compatible — existing call sites keep compiling. Consuming sites can now tighten user-facing props (toast helpers, dialog titles, form labels) to require `LocalizedString`, which turns hardcoded English at those boundaries into a compile error and makes translatable text findable by type. Interpolation via `t("Hi {name}", { name })` stays branded; composing with `+`/template literals collapses back to `string`. Opt deliberately-untranslated text (a name, an id, a number) in with `x as LocalizedString`.

## 0.1.3

### Patch Changes

- 51d7812: nk-i18n:

  - `negotiateAcceptLanguage` honors q-values per RFC 9110: the highest quality wins instead of raw header order, and a `q=0` (explicit rejection) can no longer be selected.
  - `t()` no longer throws at request time on a malformed catalog entry, a missing placeholder value, or an invalid locale tag — it degrades to the raw message and warns once per key. Previously one bad `fr` entry 500'd every French page rendering it, invisible to base-locale testing.
  - The ICU formatter cache is bounded (an unvalidated user-controlled locale could grow it without limit), and `MissingKeysPolicy` is documented as reserved/not-yet-consumed.

  nk-email:

  - `fromAddress` validates the local part with the same header-injection guard as the display name (it was interpolated raw into the address).
  - `buildListUnsubscribeHeaders` rejects values containing control characters, angle brackets, or commas, which would silently corrupt the RFC 8058 header pair.
  - `DEFAULT_TIMEOUT_MS` is exported from the package root (it was referenced by public JSDoc but unimportable).

  nk-marketing:

  - **`subscribe()` clears a global opt-out** — an explicit re-subscribe is fresh consent. Previously a contact who globally unsubscribed and later signed up again got a "successful" subscription but was silently excluded from every broadcast forever, with no code path able to detect it.
  - `identify`/`subscribe` validate the email up front with a descriptive error (mirroring the migration's check constraint) instead of surfacing a raw Postgres constraint violation.
  - A failing `releaseDelivery` can no longer abort the rest of a broadcast batch or mask the original send error in `sendLifecycle`.
  - Inbox preview text is sliced by code points, so a cut can't land inside an emoji's surrogate pair.

## 0.1.2

### Patch Changes

- 95a6b49: Make the shared TypeScript base emit valid Node ESM and enforce it. The base
  preset (`@ingram-tech/nk-dev/tsconfig/base.json`) used `moduleResolution:
"bundler"`, which silently tolerates extensionless relative imports in
  `"type": "module"` packages and emits them verbatim — invalid under Node ESM /
  Turbopack, and a recurring source of `ERR_MODULE_NOT_FOUND` ("Cannot find
  module './x'"). Switched the base to `module`/`moduleResolution: "nodenext"`, so
  tsc now errors (TS2835) on any extensionless relative import.

  This surfaced the same latent defect in three packages, now fixed by adding
  explicit `.js` extensions to their relative imports: nk-i18n, newsletter, and
  nk-auth (their published `dist` previously shipped extensionless ESM).

  App consumers are unaffected: the Next.js preset (`nextjs.json`) overrides back
  to `moduleResolution: "bundler"`, so app source still needs no `.js` extensions.
  nk-auth also overrides to "bundler" because it imports `next/server` /
  `next/headers` / `next/navigation`, whose type exports don't resolve under
  NodeNext — its relative imports still carry `.js`, so its dist is valid ESM.

## 0.1.1

`deriveLocaleConstants` now preserves each locale's literal `label` type on
`LOCALE_NAMES` (instead of widening to `string`), so labels can be used as
translation keys — e.g. `t(LOCALE_NAMES[loc])`.

## 0.1.0

Initial release. Type-safe, English-as-key i18n extracted from the Ingram sites:

- `createT` — ICU MessageFormat translator; the English source is the key, so
  the base locale needs no catalog. Compile-time key checking against the
  catalog intersection when given a scope or concrete `{ fr, nl }` source.
- `defineI18nScope` / `defineMessages` — group and brand catalogs.
- `defineI18nConfig` / `deriveLocaleConstants` / `localeMap` — one locale table,
  derived `SUPPORTED_LOCALES` / `DEFAULT_LOCALE` / `LOCALE_NAMES` and custom
  per-locale maps (`HTML_LANG`, `OG_LOCALE`, …).
- `negotiateAcceptLanguage` — `Accept-Language` negotiation primitive.
- `@ingram-tech/nk-i18n/client` — `LocaleProvider`, `useLocale`, `useT`.
