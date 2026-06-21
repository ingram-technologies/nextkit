---
"@ingram-tech/nk-dev": patch
---

`nk init`'s seed `knip.json` now encodes the house knip policy: gate on
dependency/file hygiene (unused files/deps, unlisted, unresolved) and turn off
unused exports/types (noisy, usually intentional API surface). Previously the
seed had no `rules`, so a fresh `nk init` produced a config that failed knip on
unused exports.
