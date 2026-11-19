---
"@ingram-tech/nk-dev": minor
---

`nk doctor`'s icon checks now cover every Next site of a workspace when run from its root, flag a blank `icon.svg` (it wins over `favicon.ico` and empties the tab), and tell a PNG renamed to `.ico` (warning) apart from an empty, WebP or unknown file (error).
