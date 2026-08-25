---
"@ingram-tech/nk-dev": patch
---

`nk type-check` (and every other captured tool run) no longer dies with
`spawnSync bun ENOBUFS` when the tool prints more than Node's 1 MiB default —
which a `tsc` run with a few thousand errors does, i.e. exactly the run whose
output matters. `maxBuffer` is now 256 MiB.
