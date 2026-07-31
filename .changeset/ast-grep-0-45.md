---
"@ingram-tech/nk-dev": patch
---

Move the vendored structural-search binary to `@ast-grep/cli` ^0.45.0.

0.45 deprecates the `sg` command alias, which `nk ast-grep` never used — it
resolves the native `ast-grep` binary through `resolveBinaryPath`, so the
passthrough is unaffected. Also in this release: ignore files outside
`rule_dirs` are no longer consulted during scans.
