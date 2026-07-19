---
"@ingram-tech/nk-dev": patch
---

`nk lint` now forwards extra args to oxlint, so `nk lint --fix` (and `--quiet`,
`--deny`, etc.) work — previously the wrapper dropped them, so autofixable rules
(e.g. `lucide-icon-suffix`) could only be fixed by invoking `oxlint --fix`
directly. `nk check` is unchanged (still a read-only gate).
