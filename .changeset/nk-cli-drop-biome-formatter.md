---
"@ingram-tech/nk-cli": minor
---

Drop the swappable formatter backend — `nk` is now hard-wired to oxc (oxlint +
oxfmt). The `{ "nk": { "formatter": "biome" } }` escape hatch is gone, along with
the `nk` package.json config block it was the only consumer of. Sites still on
Biome must drive `biome` through their own package.json scripts rather than via
`nk`. SQL still formats through bundled Prettier, unchanged.
