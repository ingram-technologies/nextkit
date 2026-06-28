---
"@ingram-tech/nk-auth": patch
---

Mark `bcryptPassword` as **legacy support only** (`@deprecated`): it exists
solely so sites with pre-existing bcrypt hashes keep verifying. New sites should
omit it and use Better Auth's default scrypt. The README's canonical `lib/auth.ts`
no longer wires it, and a new "Migrating bcrypt passwords to scrypt" section
documents the path (a dual-format verifier + lazy rehash-on-login or a reset
campaign; Better Auth has the reset flow natively but no rehash-on-login and no
"must reset" gate). `bcryptPassword` still works — no API change.

Also drops the optional `@supabase/supabase-js` peer dependency (and the
"Supabase RLS bridge" mention in the package description); the fleet is fully off
Supabase, and RLS now lives in `@ingram-tech/nk-db` (`withRls` /
`withRlsTransaction`).
