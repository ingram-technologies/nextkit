# @ingram-tech/nk-blog

## 0.1.4

### Patch Changes

- Updated dependencies [d77e323]
  - @ingram-tech/nk-seo@0.7.0

## 0.1.3

### Patch Changes

- a98f265: Test files are now type-checked. Every package excluded `**/*.test.ts` from the
  one tsconfig it used for both building and type-checking, so `tsc` never looked
  at a single test — and vitest strips types without checking them, so nothing
  did. Type-level assertions in tests were silently dead.

  `tsconfig.json` now excludes only `node_modules` and `dist` (and is what
  `type-check` and your editor use); the new `tsconfig.build.json` adds the test
  globs back, so `dist` still ships no tests.

  Fixing the 49 errors this surfaced was mostly mechanical (missing `.js`
  extensions on relative imports, which the NodeNext base config has always
  required), but three were real:

  - **nk-auth** `migrations.test.ts` passed `migrationsTable`, which is not a
    `PgliteServerOptions` key and was silently ignored — the test applied its
    migration chain twice, once as a dependency chain and again as the default app
    chain. It now stubs the primary applier so it tests the shape it documents.
  - **nk-seo** `metadata.test.ts` read `.type` off the `OpenGraph` union, where it
    is only present on the variants.
  - **nk-i18n**'s missing-key tests pass keys an empty catalog types as `never`.
    They exercise the runtime missing-key policy, which exists for catalogs that
    drift at runtime, so they now carry an explicit `@ts-expect-error`.

- Updated dependencies [a98f265]
  - @ingram-tech/nk-seo@0.6.2

## 0.1.2

### Patch Changes

- 821a6e1: Absolutize a relative `canonical` frontmatter override before it ships into
  BlogPosting JSON-LD (consumers don't resolve relative URLs). The same lenient
  resolver used for `image` now handles `url` too, so `canonical: "/elsewhere"`
  becomes absolute while a cross-origin syndication canonical still passes through
  untouched — deliberately not routed through nk-seo's origin-checked `absoluteUrl`,
  since blog images and syndication canonicals are legitimately off-origin.
- 8b94b66: Close a `javascript:`/`data:` URL bypass in the limited-MDX sandbox. A braced
  string-literal URL attribute (`<a href={"javascript:…"}>`) took the
  attribute-expression branch, which only checked that the value was a literal and
  never re-ran the scheme guard — so it slipped past the check that the
  plain-string (`href="javascript:…"`) and markdown-link forms both enforce.
  Braced literals on URL attributes now clear the same `isSafeUrl` guard.

## 0.1.1

### Patch Changes

- ed75401: Close the limited-MDX URL gap and harden slugs, dates, and publishing:

  - **Limited MDX now vets URLs.** `<a href="javascript:alert(1)">`, plain markdown links/images/definitions with `javascript:`/`data:` targets, and control-char-obfuscated schemes all failed nothing before — the MDX pipeline has no `urlTransform` (unlike react-markdown), so Tier-1 `.mdx` was strictly _weaker_ than `.md` against exactly the LLM-authored-content threat the boundary exists for. URL-bearing attributes (`href`, `src`, `poster`, …) and markdown link targets are now restricted to http(s)/mailto/tel and relative paths.
  - **Slugs are validated** (`/^[a-z0-9]+(?:[-._][a-z0-9]+)*$/`) in the frontmatter schema and in `publishPost`, which previously interpolated the slug into the GitHub commit path unchecked — `slug: "../.github/workflows/x"` was a repo path-traversal vector, and looser slugs broke routes, RSS `<guid>`s, and JSON-LD URLs.
  - **`publishPost` rejects a frontmatter `slug` that contradicts the publish slug.** The reader routes by the frontmatter override, so the mismatch defeated the filename collision check and could break the target site's build with a duplicate-slug error.
  - **`formatPostDate` formats in UTC by default.** Post dates are UTC midnight, so local-zone formatting rendered the previous day anywhere west of UTC (and hydration-mismatched per viewer client-side).
  - Duplicate-slug detection runs before the draft filter (a draft colliding with a live post now fails the production build too, matching the documented "always throws"); an empty `bespoke: {}` no longer silently disables the limited-MDX boundary; same-day posts sort deterministically; the GitHub source fetches blobs with bounded concurrency (8) instead of an unbounded `Promise.all`; RSS escaping strips XML-invalid control characters; relative frontmatter images are absolutized in JSON-LD.

- Updated dependencies [6b188c2]
  - @ingram-tech/nk-seo@0.6.0

## 0.1.0

### Minor Changes

- b25e3f7: New package: file-based blog foundation for Next.js sites. YAML-frontmatter
  posts are the index (no generated posts.json): a Zod frontmatter contract, a
  build-time reader (`createBlog` + `fsSource`) with drafts/featured/dedup/real
  reading time, `.md` rendering via react-markdown and AST-enforced limited-MDX
  rendering for `.mdx` (vocabulary components with literal props only — no ESM,
  no expressions), a typed component vocabulary (`defineBlogComponents`) with
  unstyled behavior-correct defaults, a GitHub source + `publishPost` write path
  for automated publishers, RSS generation, and an nk-seo JSON-LD bridge.
