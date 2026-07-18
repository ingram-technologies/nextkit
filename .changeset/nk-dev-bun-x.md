---
"@ingram-tech/nk-dev": patch
---

Invoke the site toolchain via `bun x` instead of the `bunx` shim. On some
installs — notably Windows and Git's bundled `sh`, where the `.githooks/pre-commit`
hook runs — only `bun` lands on `PATH` while the standalone `bunx` shim does not.
`bunx` is an alias for `bun x`, so spawning `bun x` works in a strict superset of
environments with identical behavior. Updated the pre-commit hook template
(`nk init`), `format-staged` (oxfmt), and the `nk` command runner (`dev`, and the
generic tool runner); the ENOENT hint now points at `bun`.

Note: `nk init` writes the hook string into each site's committed
`.githooks/pre-commit`, so existing sites keep the old `bunx` line until they
re-run `bun x nk init` (or edit the one line by hand).
