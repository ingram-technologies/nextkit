# @ingram-tech/nk-blog

File-based blogs for Next.js: one frontmatter contract, a build-time reader,
`.md`/limited-`.mdx` rendering, a typed component vocabulary with unstyled
defaults, GitHub read/publish for automated publishers, and RSS.

The files are the index. Posts are `content/blog/<slug>.md` (or `.mdx`, or
`<slug>/index.mdx` folders) with YAML frontmatter. There is no generated
`posts.json` and no metadata-extraction script.

## Entry points

| Import | Contents | Where |
|---|---|---|
| `@ingram-tech/nk-blog` | frontmatter schema, types, vocabulary manifest, reading time, dates, JSON-LD bridge | anywhere |
| `@ingram-tech/nk-blog/server` | `createBlog`, `fsSource`, `githubSource`, `publishPost`, `serializePost`, `generateRss`, `keys` | server only |
| `@ingram-tech/nk-blog/render` | `PostBody`, `MarkdownBody`, `MdxBody`, `remarkLimitedMdx`, `validateLimitedMdx` | server components |
| `@ingram-tech/nk-blog/unstyled` | behavior-correct, zero-styling vocabulary defaults | server components |

## Site setup

```ts
// src/lib/blog.ts
import { createBlog, fsSource } from "@ingram-tech/nk-blog/server";

export const blog = createBlog({
	source: fsSource("content/blog"),
	defaultAuthor: "Example Team",
	drafts: process.env.NODE_ENV !== "production",
});
```

```tsx
// src/lib/blog-components.tsx — the site's component vocabulary
import { defineBlogComponents } from "@ingram-tech/nk-blog";
import { unstyled } from "@ingram-tech/nk-blog/unstyled";

export const blogComponents = defineBlogComponents({
	...unstyled,
	// Callout: BrandCallout, — replace wholesale where the brand cares
});
```

```tsx
// src/app/blog/[slug]/page.tsx — full SSG, no runtime fs
import { PostBody } from "@ingram-tech/nk-blog/render";
import { blog } from "@/lib/blog";
import { blogComponents } from "@/lib/blog-components";
import { mdxElements } from "@/mdx-components"; // the site's own element map

export const dynamicParams = false;
export async function generateStaticParams() {
	return (await blog.slugs()).map((slug) => ({ slug }));
}

export default async function Post({ params }: PageProps<"/blog/[slug]">) {
	const { slug } = await params;
	const post = await blog.post(slug);
	if (!post) notFound();
	return <PostBody post={post} components={blogComponents} elements={mdxElements} />;
}
```

## Multilingual blogs

Set `defaultLang` and each post is written in one language:

```md
---
title: "Facturation électronique : ce qui change pour les utilisateurs Stripe"
lang: fr
translationKey: france-e-invoicing-mandate   # the English post's slug; omit for a French-only post
---
```

- **`lang`** is the post's language; posts without it take `defaultLang`.
- **Slugs are unique per language**, so a translation can reuse its original's
  slug or carry its own (a French slug for French search).
- **`translationKey`** groups a post with its translations. It defaults to the
  slug, so same-slug posts link without declaring it. A post links only to
  versions that exist: a French-only article advertises no English URL.

```ts
export const blog = createBlog({ source: fsSource("content/blog"), defaultLang: "en" });

await blog.previews({ lang: "fr" });          // the French index
await blog.post(slug, { lang: "fr" });        // a French post
const versions = await blog.translations(post);

const seoConfig = { baseUrl, basePath: "/blog", defaultLang: "en" };
postUrl(post, seoConfig);                     // /blog/what-is, /fr/blog/cest-quoi
const { canonical, languages } = blogPostAlternates(post, versions, seoConfig);
// → Metadata.alternates: { canonical, languages }
```

URLs: default-language posts live at `basePath`, others at `/<lang><basePath>`
(nk-i18n's prefix shape). Unlike nk-i18n's negotiated pages the default
language is not prefixed: a post is one document in one language with exactly
one address, so there is no language-neutral bare URL to reserve. Route the
other languages with a `[lang]` segment (`app/[lang]/blog/[slug]/page.tsx`,
`generateStaticParams` over `blog.posts()` minus the default language) so the
posts stay fully static. `blogPostArticle` sets `inLanguage`; a per-language
feed is `generateRss({ ...config, basePath: "/fr/blog", language: "fr" },
await blog.previews({ lang: "fr" }))`. `readTime` is English — localize from
`readingTimeMinutes`.

## The rules that keep this portable

- **Vocabulary, not imports.** A Tier-1 post references `<Callout>`, `<Figure>`,
  `<YouTube>`, `<Tweet>`, `<NewsletterSubscribe>` by bare name and nothing
  else. `render` enforces this in the AST (`remarkLimitedMdx`): no ESM, no
  `{…}` expressions, literal props only. Automated publishers emit `.md` (pure
  data) and validate `.mdx` with `validateLimitedMdx` before committing.
- **Tier-2 posts** are folders with a human-reviewed `components.tsx`, passed
  via `bespoke`, which relaxes the AST enforcement.
- **No pixels in this package.** The unstyled defaults carry semantics and
  behavior only and accept no visual props beyond `className`. For variation,
  replace the component in your registry; never add props here.
- **Build-time only.** `fsSource` runs under `generateStaticParams` /
  `dynamicParams = false`; serverless functions must not read post files at
  request time (output tracing won't include them).
