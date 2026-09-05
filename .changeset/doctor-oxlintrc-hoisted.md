---
"@ingram-tech/nk-dev": patch
---

`nk doctor` no longer flags a hoisted-workspace member whose `.oxlintrc.json`
extends `../node_modules/@ingram-tech/nk-dev/oxlintrc.json`. oxlint resolves
`extends` relative to the config file, so that is the only path that works when
`node_modules` lives at the workspace root; the check matched the literal
`./node_modules/…` string and `--fix` rewrote the config to a path that does
not exist, breaking `nk lint`. Both now accept any prefix that reaches the
file, and `--fix` writes the one that resolves from the site folder.
