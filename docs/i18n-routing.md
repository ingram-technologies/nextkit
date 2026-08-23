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

## Strategies

`defineLocaleRouting({ strategy })` picks how a locale is encoded.

**`"query"` (default)** — every locale gets `?hl=<locale>`, including the
default. The bare path negotiates and belongs to no locale: it is `x-default`.

```
x-default  →  /pricing            negotiates, language varies by visitor
en         →  /pricing?hl=en
fr         →  /pricing?hl=fr
nl         →  /pricing?hl=nl
```

Use it when the site wants one shareable address per page and negotiation for
humans. Google supports parameter-based locale URLs and does not recommend them,
so accept a slightly thinner margin than prefixes in exchange for not having a
locale segment to maintain.

The default locale gets its own `?hl=en` **because the bare path is not reliably
English**. As soon as country is a negotiation signal, the bare path renders
French to a crawl from France, so labelling it `en` would be false half the time.

**`"prefix"`** — the default locale keeps the bare path, others get `/<locale>/…`
(`prefixDefaultLocale` prefixes every locale instead). Stronger for ranking,
since the locale is in the path, at the cost of a routing segment.

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
	countryLocales: { FR: "fr", NL: "nl" }, // no BE: ambiguous
});
```

```ts
// proxy.ts — forward, never redirect
export function proxy(request: NextRequest) {
	const requestHeaders = new Headers(request.headers);
	forwardUrlLocale(routing, request.nextUrl, requestHeaders);
	return NextResponse.next({ request: { headers: requestHeaders } });
}
```

```ts
// lib/i18n/locale.ts
export const resolveLocale = cache(
	createLocaleResolver(routing, { account: () => getProfile().locale }),
);
```

```tsx
// app/layout.tsx
<HreflangLinks {...(await hreflangConfigFor(routing))} pathname={pathname} />
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
