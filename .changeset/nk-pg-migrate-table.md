---
"@ingram-tech/nk-db": patch
---

`nk-pg-migrate` honours `--table <name>` (the journal table, as the nk-auth README's auth-chain command uses) and refuses any argument it does not know, instead of silently running against the default `__drizzle_migrations` journal.
