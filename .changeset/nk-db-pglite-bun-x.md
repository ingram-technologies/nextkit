---
"@ingram-tech/nk-db": patch
---

The PGlite dev server now spawns `next dev` via `bun x` instead of the `bunx`
shim, so it starts on installs where only `bun` is on `PATH` (Windows, Git's
bundled `sh`). `bunx` is an alias for `bun x`; behavior is unchanged everywhere
`bunx` already worked.
