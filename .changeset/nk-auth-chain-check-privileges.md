---
"@ingram-tech/nk-auth": patch
---

The auth-chain check no longer fails every session read when the auth database
role cannot access the `drizzle` schema. It looked the journal up with
`to_regclass`, which raises "permission denied" (instead of returning null) when
the role lacks USAGE on the schema, so `getSession()` threw on sites with a
least-privilege auth role. It now reads `pg_catalog`, which every role can
read, and skips the check when the journal is missing or this role cannot read
it; such a role could not have applied the chain either.
