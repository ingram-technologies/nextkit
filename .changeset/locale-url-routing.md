---
"@ingram-tech/nk-i18n": minor
---

Add locale URL routing: `defineLocaleRouting` (one definition of how a locale is
encoded in a URL, shaped so it can be handed straight to nk-seo's
`hreflangAlternates`), a fixed precedence chain (`LOCALE_PRECEDENCE`: URL →
account → cookie → `Accept-Language` → country → default) with eager and lazy
resolvers, and a `/next` subpath wiring it to middleware and server components
(`forwardUrlLocale`, `getUrlLocale`, `createLocaleResolver`, `hreflangConfigFor`).

The URL beating the account setting is deliberate and not configurable: a shared
`?hl=fr` link must show the recipient French, or every localized link the site
ships is a lie and so is the hreflang annotation pointing at it.

See `docs/i18n-routing.md`.
