---
"@ingram-tech/nk-dev": minor
---

`nk doctor` fails a site whose `better-auth` / `@better-auth/passkey` is declared at any version or range other than the exact one the installed nk-auth pins in its `peerDependencies` (`--fix` pins it). Better Auth moves only with nk-auth, whose chain carries the schema each version needs; the guide states the rule and the order: bump, `db:migrate` against the target database, deploy.
