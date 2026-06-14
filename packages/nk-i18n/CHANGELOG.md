# @ingram-tech/nk-i18n

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
