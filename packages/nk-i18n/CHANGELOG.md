# @ingram-tech/nk-i18n

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
