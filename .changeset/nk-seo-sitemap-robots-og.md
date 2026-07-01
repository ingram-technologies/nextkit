---
"@ingram-tech/nk-seo": minor
---

Add sitemap, robots, and Open Graph image helpers.

- `createSitemap({ baseUrl, routes })` builds a `MetadataRoute.Sitemap` for
  `app/sitemap.ts`, resolving relative paths against your origin ("/" → priority
  1, others → 0.7 by default; per-route overrides supported).
- `createRobots({ baseUrl, isProduction, disallow })` builds a
  `MetadataRoute.Robots` for `app/robots.ts` and blanket-disallows non-production
  hosts, so Vercel preview / branch deployments never get indexed and dilute the
  production domain.
- `ogImageResponse(options)` on the new `@ingram-tech/nk-seo/og` entry renders a
  branded `next/og` share card, encoding the Satori "explicit `display: flex` on
  multi-child nodes" rule so titles stay plain strings and the accent rides on
  the mark. Kept on its own entry so the root and `/components` never import
  `next/og`.
