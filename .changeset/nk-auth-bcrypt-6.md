---
"@ingram-tech/nk-auth": patch
---

Bump the bundled `bcrypt` dependency from v5 to v6. Internal change only —
the hash format is unchanged, so existing password hashes continue to verify.
