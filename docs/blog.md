# @ingram-tech/nk-blog — the blog system

The shared blog foundation. Design principle: **the files are the index.**
Posts are content files with YAML frontmatter in `content/blog/`; there is no
generated `posts.json`, no metadata-extraction script, and nothing that can
drift between a site and the admin publisher.

## The model

- **Frontmatter is the contract.** Every post — `.md` or `.mdx` — starts with
  YAML frontmatter validated by `blogFrontmatterSchema` (title, description,
  date required; author/authors, category, tags, image [`coverImage` is an
  alias], slug override, draft, featured, updated; `lang`/`canonical` reserved).
  Invalid frontmatter fails the build loudly; duplicate slugs always throw.
- **Format is per post, not per site.** Simple posts are `.md` (rendered with
  react-markdown — pure data, safe for automated publishers). Rich posts are
  `.mdx`. Posts needing colocated assets/components are folders:
  `content/blog/<slug>/index.mdx`.
- **Limited MDX is an enforced security boundary.** A Tier-1 `.mdx` post may
  use prose + the component vocabulary with literal props, nothing else.
  `remarkLimitedMdx` rejects ESM, `{…}` expressions, non-literal attributes,
  unknown components, and miscased tags in the AST. This is what makes
  auto-publishing safe: MDX is a programming language, and without this pass
  `{process.env.X}` executes server-side.
- **Tier-2 (bespoke) posts** are folders with a human-reviewed
  `components.tsx`, wired via a hand-written one-line registry in the site and
  passed to `PostBody` as `bespoke` (which relaxes enforcement). Never let an
  automated publisher write Tier-2 files.
- **The package ships no pixels.** It owns the vocabulary contract
  (`VOCABULARY`, prop schemas, `defineBlogComponents` — exhaustive, so a
  missing component fails tsc) and unstyled behavior-correct defaults
  (`@ingram-tech/nk-blog/unstyled`). Sites own all styling: their markdown
  element map and any branded replacements. The unstyled defaults accept no
  visual props beyond `className` — if a site wants variation, it replaces the
  component locally; we never add theme props to the package.
- **Build-time only.** `fsSource` is for `generateStaticParams` (+
  `dynamicParams = false`), sitemap, and RSS route handlers — all build-time.
  Serverless output tracing does not follow `fs` reads inside a package, so
  request-time reads would 404 in production. Concretely: every route that
  calls the reader (listing, sitemap, RSS, OG images) must stay static — no
  `searchParams`/headers reads; use `export const dynamic = "force-static"`
  on route handlers. A `"use client"` page can't call the reader at all:
  split it and pass previews down as props. The only runtime reader is
  `githubSource` (the admin publisher listing a target's real posts).

Entry points and wiring examples live in the
[package README](../packages/nk-blog/README.md).

## Adopting in a site (the migration recipe)

1. `bun add @ingram-tech/nk-blog` (and remove any Babel/AST post-generator
   dependencies it obsoletes).
2. Create `src/lib/blog.ts` (`createBlog({ source: fsSource("content/blog"),
   defaultAuthor, drafts: process.env.NODE_ENV !== "production" })`) and
   `src/lib/blog-components.tsx` (`defineBlogComponents({ ...unstyled, … })`).
3. Move each post to `content/blog/<slug>.md(x)`: metadata becomes
   frontmatter (no `export const metadata`, no `<PostLayout>` wrapper — the
   layout belongs to the route, not the post file).
4. Replace the physical per-post routes with one `[slug]/page.tsx`:
   `generateStaticParams` from `blog.slugs()`, `dynamicParams = false`,
   metadata from the frontmatter via the site's metadata factory, body via
   `PostBody` with the site's element map, JSON-LD via
   `blogPostArticle`/`blogPostBreadcrumbs`.
5. Point the listing page/sitemap at `blog.previews()`/`blog.featured()`;
   delete the generator script and the committed `posts.json`.
6. Add `rss.xml/route.ts` (`generateRss`, `dynamic = "force-static"`).
7. Fold site-specific image fallbacks into `resolveImage` config, never a fork.
8. While migrating, fix two common bugs: real `readTime` comes from the
   reader (never author it), and `author` must hold the author, not the
   category.

Per-site variation belongs in config, never a fork: default author, image
fallback order (`resolveImage`), words-per-minute.

## Publishing (admin)

Admin publishes by committing one `content/blog/<slug>.md` via `publishPost`
(which validates frontmatter, checks slug collisions, and serializes
canonically with `serializePost`). It lists a target's real posts with
`githubSource` + `createBlog({ onInvalid: "skip" })`. Automated posts are
`.md` only; a `.mdx` post must pass `validateLimitedMdx` against the target's
vocabulary before committing. Preview = publish with `draft: true` to a
branch and let the platform preview deployment render it (dev/preview builds
list drafts). Scheduled publishing is unsupported: under full SSG a
future-dated post appears at the first deploy after its date.
