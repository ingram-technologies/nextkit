---
"@ingram-tech/nk-cli": minor
---

Default the formatter to **oxc** (oxlint + oxfmt). `nk format` / `nk lint` /
`nk check` now invoke oxfmt and oxlint; SQL still formats through the bundled
Prettier. Biome stays fully wired as a fallback for sites not yet migrated —
opt in with `{ "nk": { "formatter": "biome" } }` in package.json. `nk check`
now runs lint and format-check as separate passes (oxc splits them across two
tools) and reports both before failing.
