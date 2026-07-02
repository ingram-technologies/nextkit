# @ingram-tech/nk-seo

SEO primitives for Next.js sites, factored out of the patterns Next.js sites
keep re-implementing:

1. **`<JsonLd>`** + **typed schema.org builders** — `faqPage`, `breadcrumbList`,
   `article`, `softwareApplication`, `organization`, `website`, `person`,
   `localBusiness`, `event`, and a `createSeo` factory that resolves site-relative
   paths and injects your publisher.
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

`next` and `react` are optional peers (only the components need them).

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
`type: "article"`, or per-page `openGraph`/`twitter` overrides as needed. With
`titleTemplate` set, `pageMetadata.root()` emits `title.template`, so plain page
titles render as "Services | Acme" without every page appending the suffix.

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

The template encodes the Satori rule that trips everyone up: every node with
more than one child sets `display: flex`, and text nodes are never mixed with
sibling elements — so the headline stays a plain string and the accent rides on
the mark, not a coloured `<span>` inside the title.

No linter or type-check validates Satori-supported CSS (`ImageResponse` accepts
all of `React.CSSProperties`; Satori silently drops what it doesn't know), so
the only real validator is rendering. This package renders its template through
the real satori + resvg pipeline in its own tests; if a site hand-rolls extra
cards, give it the same guard — a vitest file (node environment) that renders
each `opengraph-image.tsx` and asserts a valid PNG comes out.

## Hreflang & canonical

Render in `<head>` from the root layout. By default it reads the `x-pathname`
request header — set it in middleware:

```ts
// middleware.ts
const res = NextResponse.next();
res.headers.set("x-pathname", req.nextUrl.pathname);
```

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

Pass `pathname` explicitly if you don't use the `x-pathname` header. When
neither is available the component **throws** instead of guessing — a silent
fallback would canonicalize every page to the homepage, the kind of site-wide
SEO bug nobody notices for months.

Two rules of the road:

- **One canonical per page.** If your pages already set `alternates.canonical`
  (e.g. via `createMetadata`), render `<HreflangLinks canonical={false} />`.
- Building metadata instead of rendering links? The pure `hreflangAlternates`
  (package root) returns the same `{ canonical, links }` for use in
  `generateMetadata`.
