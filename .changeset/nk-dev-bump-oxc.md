---
"@ingram-tech/nk-dev": patch
---

Bump the bundled oxc toolchain: oxfmt `^0.56` → `^0.58`, oxlint `^1.71` → `^1.73`. Sites on the nk-dev toolchain pick these up on their next install, so the whole fleet's formatter/linter version is managed here in one place rather than pinned per repo.
