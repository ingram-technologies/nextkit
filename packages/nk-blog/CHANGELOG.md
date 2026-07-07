# @ingram-tech/nk-blog

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
