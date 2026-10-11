---
"@ingram-tech/nk-dev": patch
---

`nk doctor --fix` no longer rewrites a compound script that runs `drizzle-kit
push` or `drizzle-kit migrate`. It used to delete the whole script (push) or
replace it with `nk-pg-migrate` (migrate), taking the other steps with it, as in
`bun run build && drizzle-kit push`. Such scripts are still reported as errors,
but have to be fixed by hand. A script that is only the drizzle-kit command is
still fixed automatically.
