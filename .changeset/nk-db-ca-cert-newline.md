---
"@ingram-tech/nk-db": patch
---

`createPool` now un-escapes a CA cert that arrives with literal `\n` instead of
real newlines, so verify-full TLS works regardless of how the env was loaded.

A multiline `DATABASE_CA_CERT` survives intact in a deployed app's runtime env
(Vercel hands it back with real newlines, so the app verifies fine), but
`vercel env pull` — and most `.env` serializers — collapse it to one quoted line
with `\n` escapes. A caller that sourced that file (the `nk-pg-migrate` runner, a
CI job) hit OpenSSL's "self-signed certificate in certificate chain" on the very
cert the app accepts. Normalising at the one point the cert reaches `pg` fixes
every caller (including the `createAuthPool` alias). A correctly-newlined PEM
contains no literal `\n`, so this is a no-op there — idempotent and safe. The
helper is exported as `normalizeCaCert`.
