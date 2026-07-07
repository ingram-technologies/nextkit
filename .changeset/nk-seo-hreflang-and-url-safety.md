---
"@ingram-tech/nk-seo": minor
---

Fix the hreflang/canonical slice and close a URL origin escape:

- **`absoluteUrl` throws when the input escapes the site origin.** A request to `https://site//evil.com/x` puts `//evil.com/x` into `req.nextUrl.pathname` and thus into `x-pathname`; the old pass-through resolved it to `https://evil.com/x` and emitted it as the canonical — an SEO-hijack primitive once cached. Backslash forms and scheme'd inputs (`javascript:`) are rejected the same way.
- **The canonical now self-references per Google's spec.** A localized variant that canonicalizes to another URL makes Google discard the whole hreflang cluster. The prefix strategy auto-detects the current locale from the pathname; the query strategy accepts a new `currentLocale` option (the server can't see the query string).
- **The prefix strategy no longer double-prefixes.** `x-pathname` carries the real `/fr/about` on a localized route; alternates were computed as `/en/fr/about` + `/fr/fr/about`. An existing locale prefix is now stripped first. `strategy: "prefix"` without `defaultLocale` throws at call time instead of silently emitting URLs no locale serves.
- **The documented middleware snippet actually works now.** It set `x-pathname` on the *response*; `headers()` reads *request* headers, so `<HreflangLinks>` threw on every request — and its error message repeated the same broken snippet. README, JSDoc, and the error message all show the `NextResponse.next({ request: { headers } })` form, note that copying `req.headers` first neutralizes client spoofing, and document the static-rendering tradeoff of the header path.
- `noIndex: true` emits `follow: true` (noindex pages should still pass link equity); query URLs append with `&` when the path already carries a query; duplicate React keys can no longer silently drop alternate links; the README's peer-dependency claim covers `/og` (which needs both `next` and `react` at runtime).
