# @ingram-tech/nk-seo

SEO primitives for Next.js sites, factored out of the patterns every Ingram site
kept re-implementing:

1. **`<JsonLd>`** + **typed schema.org builders** — `faqPage`, `breadcrumbList`,
   `article`, `softwareApplication`, `organization`, `website`, `person`,
   `localBusiness`, `event`, and a `createSeo` factory that resolves site-relative
   paths and injects your publisher.
2. **`createMetadata`** — a Next `Metadata` factory: canonical + OpenGraph +
   Twitter card from one title/description/path.
3. **`<HreflangLinks>`** — self-referencing canonical plus per-locale `hreflang`
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
		name: "Financica",
		url: "https://financica.app",
		logo: "https://financica.app/logo.png",
		sameAs: ["https://linkedin.com/company/financica"],
	},
});

// Homepage:
<JsonLd
	data={seo.softwareApplication({
		name: "Financica",
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

Already have absolute URLs and don't want the factory? The standalone builders
(`faqPage`, `article`, `breadcrumbList`, …) take absolute URLs directly.

`<JsonLd data={...} />` accepts a single node or an array (e.g.
`[organization(org), website(site)]` on the homepage).

## Page metadata

```ts
// lib/metadata.ts
import { createMetadata } from "@ingram-tech/nk-seo";

export const pageMetadata = createMetadata({
	baseUrl: "https://ingram.tech",
	siteName: "Ingram Technologies",
	defaultImage: "/images/og.png",
	locale: "en_US",
	twitterSite: "@IngramTech",
});

// app/services/page.tsx
export const metadata = pageMetadata({
	title: "Services",
	description: "AI deployment and custom agents.",
	path: "/services",
});
```

Produces `title`, `description`, a self-referencing `alternates.canonical`,
`openGraph`, and a `summary_large_image` Twitter card. Pass `noIndex`, `keywords`,
`type: "article"`, or per-page `openGraph`/`twitter` overrides as needed.

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
<HreflangLinks baseUrl="https://financica.app" locales={["en", "fr", "nl"]} />

// Path-prefix locales (/fr/about), default locale bare, regional hreflang tags:
<HreflangLinks
	baseUrl="https://malinamore.studio"
	locales={["en", "fr", "nl"]}
	strategy="prefix"
	defaultLocale="en"
	hrefLangTags={{ en: "en-BE", fr: "fr-BE", nl: "nl-BE" }}
	canonical={false}
/>
```

Pass `pathname` explicitly if you don't use the `x-pathname` header.
