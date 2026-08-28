# Locale routing

How a locale is encoded in a URL, how a request's locale is decided, and why the
two must come from one definition.

Owned by `@ingram-tech/nk-i18n` (`/routing` at the root, `/next` for the Next
wiring) and `@ingram-tech/nk-seo` (hreflang emission, `/verify` for the check).

## The rule

**A URL that names a locale serves that locale, with a 200, to everybody.**

Everything below follows from it.

## Why URLs at all

Content negotiation is correct HTTP and it is not a substitute for URLs.

A search index maps one URL to one stored document: one title, one snippet, one
language. Three languages behind one address cannot be three results, and
`hreflang` — the only mechanism Google offers for grouping translations — takes
URLs as its arguments, so there is nothing to annotate if the variants have no
addresses.

Googlebot also crawls from US addresses, sends **no `Accept-Language`**, and
keeps no cookies between requests. A cookie-driven or header-driven language is
invisible to it by construction. `Content-Language` and `<html lang>` are not
indexing signals, and `Vary` is a cache directive with no counterpart in an
index.

RFC 9110 §12.1 is not on negotiation's side either: it opens with "Proactive
negotiation has serious disadvantages", notes a server cannot know what is best
for a user, and states that clients cannot rely on preferences being honored.
The reactive alternative (§12.2) that would have fixed this was never specified
for automatic selection; `Alternates`/TCN (RFC 2295/2296) shipped Experimental
in 1998 and no browser implemented it.

So: negotiation is a fine convenience at a front door, and never the addressing
scheme.

## The cluster shape is fixed

Whichever strategy you pick:

- every locale has its own address, **the default included**;
- the bare path belongs to **no** locale. It negotiates, and it is `x-default`.

```
x-default  →  /pricing            negotiates; language varies by visitor
en         →  /pricing?hl=en      or  /en/pricing
fr         →  /pricing?hl=fr      or  /fr/pricing
nl         →  /pricing?hl=nl      or  /nl/pricing
```

This is not configurable, deliberately. The two shapes it excludes are the ones
that go wrong:

- **bare path IS the default locale.** A French visitor who follows a bare
  internal link gets English, and every site that starts with a cookie switcher
  has bare internal links. This is the bug that made one fleet site fork its
  middleware rather than adopt the helpers.
- **bare path redirects on perceived language.** Google tells you not to build
  this, and it makes `x-default` point at a URL that is not language-neutral.

Offering either as an option is how the fleet drifts, so neither is offered.

## Strategies

`defineLocaleRouting({ strategy })` picks only the **encoding**.

**`"prefix"`** — `/fr/pricing`. Prefer this for a new site. It is better on
every SEO axis: a path cannot be folded into another document the way a query
parameter can (and the URL Parameters tool that used to override that was
retired in 2022), it survives link-sharing and CMS fields that strip query
strings, it does not combine with campaign parameters into an open-ended URL
space, it puts the target-language keyword in the URL, and analytics group by
pathname for free.

`localeProxy` rewrites `/fr/pricing` to `/pricing`, so the app keeps one route
tree and never learns what a locale is.

**`"query"` (default)** — `/pricing?hl=fr`. Google supports it and does not
recommend it. Use it when restructuring routes is not worth it, knowing it is
the weaker of the two — typically a marketing tree of React components with
inline `t()` calls, where the win from having addresses at all dwarfs the gap
between the two encodings.

## The precedence chain

`LOCALE_PRECEDENCE` in `nk-i18n/routing.ts`, declared once:

1. **the URL** (`?hl=fr`, or a path prefix)
2. the account's stored preference
3. the remembered-choice cookie
4. `Accept-Language`
5. country, via `countryLocales`
6. `defaultLocale`

**The order is not configurable, and the URL beating the account setting is the
load-bearing part.** A shared link must show the recipient the language it names.
If a stored preference can override it, every localized link the site ships is a
lie, and the `hreflang` annotation pointing at it is a lie to Google too.

Country is last because it is the weakest guess: it says where someone is, not
what they read. Leave genuinely ambiguous countries out of `countryLocales`
rather than guessing — Belgium is the standing example, where geography does not
distinguish French from Dutch and `Accept-Language` must decide.

`resolveLocaleFromSignals` (eager) and `resolveLocaleFromSuppliers` (lazy, so a
`?hl=` request costs no database round trip) both walk that one list.

## Canonicals follow the address, not the language

A canonical is a claim about an address. Under `"query"`:

- `/pricing` canonicalizes to `/pricing`, **even while rendering French**.
- `/pricing?hl=fr` canonicalizes to `/pricing?hl=fr`.

Passing the *negotiated* locale as `currentLocale` makes the bare path claim to
be the French URL, and the real French URL then looks like a duplicate of it.
`hreflangConfigFor(routing)` from `@ingram-tech/nk-i18n/next` reads the locale
from the URL and fills this in correctly; prefer it over assembling the config by
hand.

## Wiring

```ts
// lib/i18n/routing.ts
export const routing = defineLocaleRouting({
	baseUrl: "https://acme.example",
	locales: ["en", "fr", "nl"],
	defaultLocale: "en",
	strategy: "prefix",
	countryLocales: { FR: "fr", NL: "nl" }, // no BE: ambiguous
	hrefLangTags: { en: "en-BE", fr: "fr-BE", nl: "nl-BE" }, // only if content differs
});
```

```ts
// proxy.ts — the whole middleware side
export function proxy(request: NextRequest) {
	return localeProxy(routing, request);
}
```

`localeProxy` forwards the pathname and URL-locale headers, rewrites a locale
prefix away, and remembers an explicit choice in the cookie. It never redirects.
Middleware that does more of its own work passes its headers in and keeps
editing the response:

```ts
const requestHeaders = new Headers(request.headers);
requestHeaders.set("x-tenant", tenant);
const response = localeProxy(routing, request, { requestHeaders });
response.cookies.set(…);
return response;
```

```ts
// lib/i18n/locale.ts — narrowed to your locale union, no cast
export const resolveLocale = cache(
	createLocaleResolver(routing, { account: () => getProfile().locale }),
);
```

```tsx
// app/layout.tsx — pathname comes from the header localeProxy set
<html lang={routing.htmlLang(locale)}>
	<head>
		<HreflangLinks {...(await hreflangConfigFor(routing))} />
	</head>
</html>
```

The language switcher must be real `<a href>` links to `routing.urlForLocale(…)`.
`hreflang` is an annotation, not a discovery mechanism: a button that calls a
server action gives a crawler no path to the other languages.

## Verify it

`hreflang` is a set of promises about *other* URLs, and nothing local can tell
you whether they hold. A site can emit a flawless cluster while middleware
redirects every URL in it away, and the only symptom is search traffic that never
arrives. Fetch them:

```ts
import { assertHreflangCluster } from "@ingram-tech/nk-seo/verify";

await assertHreflangCluster(routing, ["/", "/pricing", "/docs/getting-started"]);
```

It fails on an advertised URL that redirects or is not 200, a variant that
canonicalizes elsewhere, a missing or duplicated canonical, a non-reciprocal
cluster, and an `<html lang>` that contradicts the `hreflang` it is advertised
under. Run it against a real deployment in CI.

## Things not to do

- **Never redirect a URL that names a locale.** This is the bug the whole module
  exists to prevent.
- **Never redirect a deep URL on `Accept-Language` or geo.** Googlebot arrives
  with no language preference and gets bounced into the default, taking the
  cluster with it. Negotiate at `/` if you must, and prefer a dismissible banner.
- **Never serve a crawler a different language than a human gets at the same
  URL.** That is cloaking, and the penalty is manual and discretionary.
- **Never canonicalize a variant to the bare path.** It is the one change that
  undoes the entire setup while looking tidy in a diff.
- **Do not use region tags** (`fr-BE`, `nl-BE`) unless the content genuinely
  differs by country. They fragment the cluster and cut you out of neighbouring
  markets for nothing.
