# @ingram-tech/nk-i18n

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
