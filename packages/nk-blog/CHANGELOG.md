# @ingram-tech/nk-blog

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
