---
"@ingram-tech/nk-auth": patch
---

`createAuthPool` now connects to managed Postgres (e.g. Supabase) over TLS
without chain verification when no `caCert` is given and the host is remote —
Supabase's cert chain isn't in Node's trust store, so plain `pg` verification
fails with "self-signed certificate in certificate chain" (this 500'd peppost's
login in production). Local connections stay non-TLS; `caCert` still does full
verification. `sslmode` is stripped from the URL so `pg` honors the ssl object.
