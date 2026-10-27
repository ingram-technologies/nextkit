---
"@ingram-tech/nk-dev": patch
---

oxfmt 0.75. The 0.73 breaking changes (a TOML formatter and a reworked
`--migrate prettier`) do not reach sites: the shipped oxfmtrc ignores
`*.toml`, and nothing in nk-dev runs the Prettier migration.
