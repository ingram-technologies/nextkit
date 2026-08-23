# @ingram-tech/nk-seo

SEO primitives for Next.js sites, factored out of the patterns Next.js sites
keep re-implementing:

1. **`<JsonLd>`** + **typed schema.org builders** — `faqPage`, `breadcrumbList`,
   `article`, `softwareApplication`, `organization`, `website`, `person`,
   `localBusiness`, `event`, `dataset`, `definedTerm`/`definedTermSet`, and a
   `createSeo` factory that resolves site-relative paths and injects your
   publisher.
2. **`createMetadata`** — a Next `Metadata` factory: canonical + OpenGraph +
   Twitter card from one title/description/path.
3. **`createSitemap` / `createRobots`** — `app/sitemap.ts` and `app/robots.ts`
   route helpers; `createRobots` blanket-disallows non-production hosts so
   Vercel preview / branch URLs never get indexed.
4. **`ogImageResponse`** (`@ingram-tech/nk-seo/og`) — a branded `next/og` share
   card that sidesteps the Satori multi-child pitfall.
5. **`<HreflangLinks>`** — self-referencing canonical plus per-locale `hreflang`
   alternates (query-param or path-prefix strategy).

The package root (`@ingram-tech/nk-seo`) is **pure** — builders and the metadata
factory, no React — so `sitemap.ts` and route handlers can import it freely. The
components live at `@ingram-tech/nk-seo/components`.

## Install

```bash
bun add @ingram-tech/nk-seo
```

`next` and `react` are optional peers — the package root is runtime-free of
both; the `/components` and `/og` entries need them (`/og` uses `next/og` and
the React JSX runtime).

## Structured data

```tsx
import { JsonLd } from "@ingram-tech/nk-seo/components";
import { createSeo } from "@ingram-tech/nk-seo";

const seo = createSeo({
	baseUrl: getServerUrl(),
	organization: {
		name: "Acme",
		url: "https://example.com",
		logo: "https://example.com/logo.png",
		sameAs: ["https://www.linkedin.com/company/acme"],
	},
});

// Homepage:
<JsonLd
	data={seo.softwareApplication({
		name: "Acme",
		applicationCategory: "BusinessApplication",
		operatingSystem: "Web",
		offers: { priceCurrency: "EUR", lowPrice: 59, highPrice: 299, offerCount: 2, url: "/pricing" },
	})}
/>
<JsonLd data={seo.faqPage(faqs)} />

// Blog post (path + image resolved, configured org used as publisher):
<JsonLd data={seo.article({ path: `/blog/${slug}`, headline, datePublished, authors: [{ name: author }] })} />
<JsonLd data={seo.breadcrumbs([{ name: "Home", path: "/" }, { name: "Blog", path: "/blog" }, { name: title, path: `/blog/${slug}` }])} />
```

`createSeo` resolves **nested** URL fields too — the organization's `url`/`logo`
and `offers.url` may be site-relative, as in the example above. Already have
absolute URLs and don't want the factory? The standalone builders (`faqPage`,
`article`, `breadcrumbList`, …) take absolute URLs directly (they resolve
nothing).

Every builder returns a typed node (`FaqPageNode`, `ArticleNode`, …), so the
shape survives past the call site. `<JsonLd data={...} />` accepts a single node
or an array (e.g. `[organization(org), website(site)]` on the homepage), and
escapes `<` on serialization so CMS-sourced strings can't break out of the
`<script>` tag.

### Properties the builders don't cover

schema.org is much larger than any builder surface, so every builder takes an
`extra` object shallow-merged over the built payload (it wins on conflict).
Reach for it rather than dropping the whole node back to a literal:

```ts
website({
	name: "Acme",
	url: "https://example.com",
	extra: {
		alternateName: "ACME",
		inLanguage: ["en", "fr"],
		potentialAction: {
			"@type": "SearchAction",
			target: "https://example.com/search?q={search_term_string}",
			"query-input": "required name=search_term_string",
		},
	},
});
```

`extra` works on nested inputs too — `publisher: { name: "Acme", extra: {…} }`.
Values passed this way aren't reflected in the returned node type.

For a node type no builder covers, `<JsonLd data={…} />` takes **any** object or
array of objects. Hand-written nodes still get the `<` / U+2028 escaping, which
is the security-relevant half of the package — worth preferring over
`dangerouslySetInnerHTML` even with no builder involved.

`article` covers `Article`, `BlogPosting`, `NewsArticle`, `ScholarlyArticle`,
`TechArticle` (the right type for API/developer docs) and `Report` via `type`.
`dataset` and `definedTerm`/`definedTermSet` mark up data and controlled
vocabularies:

```ts
<JsonLd
	data={seo.definedTerm({
		name: "Computer programming",
		termCode: "62.01",
		path: "/code/62.01",
		inDefinedTermSet: { name: "Acme classification", path: "/", version: "2025" },
		extra: { inLanguage: "en" },
	})}
/>
```

## Page metadata

```ts
// lib/metadata.ts
import { createMetadata } from "@ingram-tech/nk-seo";

export const pageMetadata = createMetadata({
	baseUrl: "https://example.com",
	siteName: "Acme",
	titleTemplate: "%s | Acme",
	defaultImage: "/images/og.png",
	locale: "en_US",
	twitterSite: "@acme",
});

// app/layout.tsx — metadataBase + default title (+ template when configured):
export const metadata = pageMetadata.root({ description: "The Acme platform." });

// app/services/page.tsx
export const metadata = pageMetadata({
	title: "Services",
	description: "AI deployment and custom agents.",
	path: "/services",
});
```

Produces `title`, `description`, a self-referencing `alternates.canonical`,
`openGraph`, and a `summary_large_image` Twitter card. Pass `noIndex`, `keywords`,
`type: "article"`, or per-page `alternates`/`openGraph`/`twitter` overrides as
needed — each is merged into the generated object and wins on conflict. With
`titleTemplate` set, `pageMetadata.root()` emits `title.template`, so plain page
titles render as "Services | Acme" without every page appending the suffix.

On a localized site the per-page `alternates` and `locale` are what make the
factory usable — `alternates.languages` is what Next renders as
`<link rel="alternate" hreflang>`, and `og:locale` has to vary per page:

```ts
import { hreflangAlternates } from "@ingram-tech/nk-seo";

const { languages } = hreflangAlternates(HREFLANG_CONFIG, `/${locale}/about`);
return pageMetadata({
	title, description, path: `/${locale}/about`,
	alternates: { languages },
	locale: "fr_BE",   // overrides the site-wide `locale`
});
```

## Sitemap & robots

```ts
// app/sitemap.ts
import { createSitemap } from "@ingram-tech/nk-seo";

export default () =>
	createSitemap({
		baseUrl: getServerUrl(), // your deployment's own origin
		routes: ["/", "/pricing", "/docs", "/faq", "/support"],
	});
```

`"/"` defaults to priority 1, every other route to 0.7; pass objects
(`{ path, lastModified, changeFrequency, priority, languages }`) to override, or
set `lastModified` / `defaultChangeFrequency` / `defaultPriority` site-wide.
Absolute URLs pass through untouched; a `priority` outside 0–1 throws (Google
would silently reject the whole entry). Localized routes can declare their
alternates — `languages: { en: "/about", fr: "/fr/about" }` — mirroring what
`<HreflangLinks>` emits on the page itself.

```ts
// app/robots.ts
import { createRobots } from "@ingram-tech/nk-seo";

export default () =>
	createRobots({
		baseUrl: getServerUrl(),
		isProduction: process.env.VERCEL_ENV === "production",
		disallow: ["/api/", "/internal/", "/login"],
	});
```

When `isProduction` is false the whole site is disallowed — the one SEO
safeguard everyone forgets on Vercel, where preview and branch deployments are
otherwise crawlable and compete with the production domain for the same content.

## Open Graph image

`@ingram-tech/nk-seo/og` is a separate entry (it pulls in `next/og`), so the
package root and `/components` never carry the renderer.

```tsx
// app/opengraph-image.tsx  (and re-export from app/twitter-image.tsx)
import { ogImageResponse } from "@ingram-tech/nk-seo/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Acme — Ship faster";

export default () =>
	ogImageResponse({
		title: "Ship faster with Acme",
		subtitle: "The all-in-one platform for modern teams.",
		wordmark: "Acme",
		footer: "example.com",
		accent: "#565ac9",
	});
```

Pass `logo` (absolute URL or data URI) to replace the accent-square mark with
your logo, and `fonts` + `fontFamily` to render with the brand typeface —
`fonts` is forwarded to `ImageResponse`, which takes raw TTF/OTF/WOFF data.

### Two ways the generated card silently doesn't reach your pages

Both fail with a green build and no warning; only fetching each page type shows
them.

**A page's own `openGraph` drops the inherited image.** Next attaches a
file-convention image to the segment that declares it, and sibling metadata
objects are *replaced*, not deep-merged — so any page whose `generateMetadata`
returns an `openGraph` object (i.e. any page setting `og:title`/`og:url`) emits
no `og:image` at all. The home page, sitting in the same segment as the image
file, looks perfectly correct throughout. Build the list once and spread it into
every page:

```ts
import { ogImageMetadata } from "@ingram-tech/nk-seo";

const images = ogImageMetadata({ baseUrl, path: "/opengraph-image", alt: "Acme" });
return { title, openGraph: { title, url, images } };
```

`createMetadata`'s `defaultImage` / per-page `image` already do this — point
either at the image route and every page it builds carries the card.

**Locale-negotiating middleware eats the image route.** A site that redirects
any path lacking a locale prefix also redirects `/opengraph-image`, so the card
URL never resolves. Put the file at `app/[locale]/opengraph-image.tsx` instead:
it dodges the redirect and gives per-locale cards from `params`. That is the
better default for any localized site.

The template encodes the Satori rule that trips everyone up: every node with
more than one child sets `display: flex`, and text nodes are never mixed with
sibling elements — so the headline stays a plain string and the accent rides on
the mark, not a coloured `<span>` inside the title.

Type-check won't help here: `ImageResponse` accepts all of
`React.CSSProperties` and Satori silently drops what it doesn't know. Two guards
cover that. `@ingram-tech/nk-dev`'s oxlint plugin ships `nextkit/satori-css`,
which flags unsupported style properties, `calc()`, and the two structural rules
in files that import `next/og` or are an `opengraph-image`/`twitter-image`
convention. And rendering remains the final validator: this package renders its
template through the real satori + resvg pipeline in its own tests, so a site
hand-rolling extra cards should add the same guard — a vitest file (node
environment) that renders each `opengraph-image.tsx` and asserts a valid PNG
comes out.

## Hreflang & canonical

Render in `<head>` from the root layout. By default it reads the `x-pathname`
request header — set it on the **forwarded request** in middleware (setting it
on the response does nothing: `headers()` in a server component reads incoming
request headers):

```ts
// middleware.ts
const requestHeaders = new Headers(req.headers);
requestHeaders.set("x-pathname", req.nextUrl.pathname);
return NextResponse.next({ request: { headers: requestHeaders } });
```

Copying `req.headers` first also overwrites any client-spoofed `x-pathname`.
Note that reading the header (`headers()`) opts the page into dynamic
rendering — pass `pathname` explicitly (e.g. from route params) on pages that
must stay static.

```tsx
import { HreflangLinks } from "@ingram-tech/nk-seo/components";

// Query-param locales (?hl=fr):
<HreflangLinks baseUrl="https://example.com" locales={["en", "fr", "nl"]} />

// Path-prefix locales (/fr/about), default locale bare, regional hreflang tags:
<HreflangLinks
	baseUrl="https://example.com"
	locales={["en", "fr", "nl"]}
	strategy="prefix"
	defaultLocale="en"
	hrefLangTags={{ en: "en-BE", fr: "fr-BE", nl: "nl-BE" }}
	canonical={false}
/>
```

Sites that prefix **every** locale — where `/about` redirects to `/en/about`
and no bare path exists — pass `prefixDefaultLocale`, which prefixes the default
locale too and points `x-default` at that prefixed URL. Without it the bare path
is emitted for both `en` and `x-default`, annotating URLs that redirect (Google
wants every hreflang target to answer 200 directly).

```tsx
<HreflangLinks
	baseUrl="https://example.com"
	locales={["en", "fr", "nl"]}
	strategy="prefix"
	defaultLocale="en"
	prefixDefaultLocale
/>
```

Pass `pathname` explicitly if you don't use the `x-pathname` header. When
neither is available the component **throws** instead of guessing — a silent
fallback would canonicalize every page to the homepage, the kind of site-wide
SEO bug nobody notices for months.

Two rules of the road:

- **One canonical per page.** If your pages already set `alternates.canonical`
  (e.g. via `createMetadata`), render `<HreflangLinks canonical={false} />`.
- **The canonical must self-reference, and it follows the ADDRESS, not the
  rendered language.** A localized variant that canonicalizes to a different URL
  makes Google discard the whole hreflang cluster. Under `"query"` the bare path
  is the negotiating `x-default` and belongs to no locale, so `/pricing`
  canonicalizes to `/pricing` even while negotiation renders it in French — pass
  `currentLocale` only when the URL itself names a locale. The prefix strategy
  auto-detects it from the (possibly `/fr/…`-prefixed) pathname; the query
  strategy can't see the query string server-side, so
  [`hreflangConfigFor(routing)`](../nk-i18n/README.md) from
  `@ingram-tech/nk-i18n/next` is the wiring that gets this right for you.
- Building metadata instead of rendering links? The pure `hreflangAlternates`
  (package root) returns the same links for use in `generateMetadata`:
  `{ canonical, links, languages }`, where `languages` is already keyed by
  hreflang for `Metadata.alternates.languages` (or `createMetadata`'s
  per-page `alternates`).

## Verifying the cluster (`/verify`)

hreflang is a set of promises about **other** URLs, and nothing local can tell
you whether they hold. A site can emit a flawless cluster while its middleware
redirects every URL in it away, or while each variant quietly canonicalizes to
the default language. Both delete the non-default languages from search, neither
raises an error, and Search Console reports them as ordinary redirects and
duplicates months later. Fetch them:

```ts
import { assertHreflangCluster } from "@ingram-tech/nk-seo/verify";
import { routing } from "@/lib/i18n/routing";

await assertHreflangCluster(routing, ["/", "/pricing", "/docs/getting-started"]);
```

It fails on an advertised URL that redirects or isn't 200, a variant that
canonicalizes elsewhere, a missing or duplicated canonical, a non-reciprocal
cluster, and an `<html lang>` contradicting the `hreflang` it's advertised under.
`verifyHreflangCluster` returns the problems instead of throwing.

Run it against a real deployment — it is the only check that sees what a crawler
sees. A `LocaleRouting` from `@ingram-tech/nk-i18n` is a valid config for it.
