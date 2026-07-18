---
"@ingram-tech/nk-blog": patch
---

Absolutize a relative `canonical` frontmatter override before it ships into
BlogPosting JSON-LD (consumers don't resolve relative URLs). The same lenient
resolver used for `image` now handles `url` too, so `canonical: "/elsewhere"`
becomes absolute while a cross-origin syndication canonical still passes through
untouched — deliberately not routed through nk-seo's origin-checked `absoluteUrl`,
since blog images and syndication canonicals are legitimately off-origin.
