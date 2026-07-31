---
"@ingram-tech/nk-dev": patch
---

Move the bundled formatter to `oxfmt` ^0.61.0.

No source file in this repo reformats across the bump, so a consuming site
should see no diff either. 0.61 adds a YAML formatter, but it does not claim
`.yml` files on its own — `oxfmt --check .` matches the same set it did before,
and `.github/workflows` is untouched.
