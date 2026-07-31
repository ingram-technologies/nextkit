---
"@ingram-tech/nk-dev": minor
---

New oxlint rule `nextkit/satori-css` (warn): validates inline styles in
satori-rendered JSX — the properties `next/og` accepts from
`React.CSSProperties` but satori silently drops, `calc()`, and the two
structural rules satori throws on (a multi-child node needs an explicit
`display`, text can't sit beside element siblings). Scoped to files importing
`next/og`/`@vercel/og` or named `opengraph-image`/`twitter-image`, and
deliberately conservative: conditional children and non-literal styles are left
alone. Closes the gap render tests can't see — a dropped property still yields a
valid PNG, just the wrong one.
