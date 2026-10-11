---
"@ingram-tech/nk-dev": patch
---

ast-grep 0.50 behind `nk ast-grep`. The only behavioural change is that
custom language libraries now need an explicit opt-in; the built-in TS/TSX
grammars `nk ast-grep` and the codemod skill use are unaffected.
