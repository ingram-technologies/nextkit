---
"@ingram-tech/nk-dev": minor
---

`nk doctor` understands Bun/npm/pnpm workspaces. A workspace root may fan
`type-check` and `ci` out to its members (`--filter`, `-r`, `--workspaces`,
`turbo run`); a listed member inherits nk-dev from the root and leaves
`lint`/`format` to a root that runs them; and only a member with a
`next.config.*` is asked for `nk type-check` (which runs `next typegen`), so a
library's `tsc --noEmit` passes. A standalone site is judged as before.
