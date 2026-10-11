---
"@ingram-tech/nk-dev": minor
---

New `nk doctor` check: a Next site with routes in a root `app/` fails with
`layout:root-app-dir`. nextkit sites keep their routes in `src/app/`. Next
accepts both and, when both exist, serves `app/` and ignores `src/app/`
entirely. There is no autofix: moving the directory touches imports and
tsconfig `paths`. The endpoint-shadow, Open Graph and `next`-header checks no
longer look in a root `app/`, and the guide states the rule.
