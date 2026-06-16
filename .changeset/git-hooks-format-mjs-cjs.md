---
"@ingram-tech/git-hooks": patch
---

Format staged `.mjs` / `.cjs` files in `nextkit-format-staged`. oxfmt handles
them, but they were missing from the extension filter, so config/scripts in
those formats were skipped on commit (and only caught later by CI's `oxfmt
--check`).
