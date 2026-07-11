---
"@ingram-tech/nk-seo": patch
---

`createRobots` now throws if a `disallow` entry would block `/_next`. Crawlers
must fetch the JS/CSS under `/_next` to render pages, so disallowing it silently
degrades indexing — Next.js does not block it by default and neither should a
site. The guard is a prefix check (`/_next`, `/_next/`, `_next/static`, …); an
unrelated prefix like `/_preview` is unaffected.
