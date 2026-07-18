---
"@ingram-tech/nk-dev": minor
---

Add `nk ast-grep` — AST-aware structural search & rewrite of TS/TSX, backed by a
vendored [ast-grep](https://ast-grep.github.io) (`@ast-grep/cli`, resolved to the
pinned binary rather than a global on `PATH`). Args pass straight through to
ast-grep. Ships alongside it a codemod **skill** (`skills/ts-codemod.md`) that the
agent guide points to, teaching the search → preview → apply → `nk format` +
`nk type-check` workflow and its syntactic-not-semantic limits — so large
mechanical refactors (import rewrites, API renames, call-shape changes) stop being
hand-edited file by file. Purely additive; no existing command changes.
