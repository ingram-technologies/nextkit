# @ingram-tech/nk-blog

File-based blogs for Next.js sites: one frontmatter contract, a build-time
reader, `.md`/limited-`.mdx` rendering, a typed component vocabulary with
unstyled defaults, GitHub read/publish for automated publishers, and RSS.

**The files are the index.** Posts are `content/blog/<slug>.md` (or `.mdx`,
or `<slug>/index.mdx` folders) with YAML frontmatter. There is no generated
`posts.json`, no metadata-extraction script, and nothing to drift.

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
// src/lib/blog-components.tsx — the site's entire vocabulary obligation
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

## The rules that keep this portable

- **Vocabulary, not imports.** A Tier-1 post references `<Callout>`, `<Figure>`,
  `<YouTube>`, `<Tweet>`, `<NewsletterSubscribe>` by bare name and nothing
  else. `render` enforces this in the AST (`remarkLimitedMdx`): no ESM, no
  `{…}` expressions, literal props only. Automated publishers emit `.md` (pure
  data) and validate `.mdx` with `validateLimitedMdx` before committing.
- **Tier-2 (bespoke) posts** are folders with human-reviewed `components.tsx`,
  passed via `bespoke` — which relaxes enforcement, because a human merged it.
- **No pixels in this package.** The unstyled defaults carry semantics and
  behavior only and accept no visual props beyond `className`. Want variation?
  Replace the component in your registry — never add props here.
- **Build-time only.** `fsSource` runs under `generateStaticParams` /
  `dynamicParams = false`; serverless functions must not read post files at
  request time (output tracing won't include them).
