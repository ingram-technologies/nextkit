---
"@ingram-tech/nk-auth": patch
---

README: document Better Auth 1.7.5+'s pre-endpoint schema check, which the
1.7.7 pin brings in. Every auth call, `getSession` included, first checks the
database schema. A site that owns its auth tables in its own chain fails every
call if a column Better Auth does not write is left NOT NULL (e.g. an
unrelaxed `account.issuer`). Unit tests that reach a real `getSession` without
a database now throw, and should mock the session seam.
