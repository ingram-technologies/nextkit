---
"@ingram-tech/newsletter": minor
---

Upgrade the `zod` runtime dependency from v3 to v4, aligning newsletter with the
rest of the workspace (`nk-db` and `nk-auth` already run zod 4). No public API
changes; schemas were already written in the zod-4-compatible style.
