---
"@ingram-tech/nk-dev": minor
---

`nk type-check` starts cold when the dependency tree moved: a `*.tsbuildinfo`
older than `bun.lock` / `package.json` is dropped before the run, because
`tsc --incremental` does not reliably re-check a program after a dependency's
`.d.ts` changes and a green result against the stale cache means nothing.
`--cold` drops the cache unconditionally. `nk doctor` now flags a `"prettier"`
key in `package.json` and `.prettierrc*` files alongside `.prettierignore`
(all `--fix`able), and warns when a site has no `ci` script or one that skips
`nk check` / `nk type-check`.
