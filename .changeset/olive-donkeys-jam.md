---
"@ingram-tech/nk-dev": minor
---

Guard the drizzle migration chain: `nk migrations` and two new `nk doctor` findings.

Applied migrations are immutable — the runner records `sha256(file)`, so editing
one after it has run drifts every database that applied it, and drizzle never
looks at the file again to notice. `nk migrations` pins each file's hash in a
committed `drizzle/_seal.json` and `nk check` fails on a mismatch, so the edit
surfaces in the PR that made it instead of on the next deploy. `--reseal` is the
deliberate-squash escape hatch, and its effect is visible in the diff.

`nk migrations --ddl` (and a `nk doctor` finding) lists the migrations carrying
DDL drizzle's snapshot cannot model — functions, triggers, `DEFERRABLE`
constraints, grants, roles, extensions, materialized views. Those are outside
`db:generate`'s diff basis entirely, so a clean generate does not mean the chain
reproduces the database, and anything regenerated from `schema.ts` drops them.

Both run without a database. `nk doctor` also seals an unsealed chain on `--fix`.
