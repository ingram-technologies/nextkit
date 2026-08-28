---
"@ingram-tech/nk-i18n": minor
"@ingram-tech/nk-seo": minor
---

Fix the locale cluster shape, and give middleware one way to be written.

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
