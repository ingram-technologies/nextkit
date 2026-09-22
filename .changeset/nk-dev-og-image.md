---
"@ingram-tech/nk-dev": minor
---

New `nk doctor` check: a page or layout whose `openGraph` / `twitter` metadata
declares a card without an image in reach. Next attaches an `opengraph-image.*`
file to the segment that declares it, and a segment's own `openGraph` object
replaces the inherited one, so any metadata object setting `openGraph` without
`images` emits `og:title`, `og:description` and `summary_large_image` with no
`og:image` unless the file sits in that same directory. Slack, LinkedIn and
iMessage render that as a blank placeholder, the build is green, and the home
page next to the image looks right. The incident class is real: a site image
under the `(landing)` group left the login page, and so every pasted link to a
signed-in page, with a blank card.
