# @ingram-tech/nk-auth

## 0.3.0

### Minor Changes

- UUIDv7 ids + auth mounts at `/auth`, not `/api/auth`.

  - `uuidGenerateId` now mints **UUIDv7** (time-ordered, RFC 9562) instead of v4 —
    ids cluster by creation time for B-tree locality while staying UUID-shaped for
    Supabase `auth.uid()::uuid`. Affects only newly-minted ids; existing ids are
    unchanged.
  - New `authBasePath` export (`"/auth"`, also re-exported from `./paths` and
    `./client`). Better Auth should mount at `/auth` via `basePath: authBasePath`
    with the handler at `app/auth/[...all]/route.ts` — auth is a user-facing
    surface (sign-in, OAuth callbacks), not an internal `/api` machine endpoint.
    OAuth redirect URIs become `<site>/auth/callback/<provider>` and the JWKS
    `<site>/auth/jwks`; update provider consoles + the Supabase JWKS issuer when
    moving an existing site.

### Patch Changes

- 564413c: `createAuthPool` now connects to managed Postgres (e.g. Supabase) over TLS
  without chain verification when no `caCert` is given and the host is remote —
  Supabase's cert chain isn't in Node's trust store, so plain `pg` verification
  fails with "self-signed certificate in certificate chain" (this 500'd an app's
  login in production). Local connections stay non-TLS; `caCert` still does full
  verification. `sslmode` is stripped from the URL so `pg` honors the ssl object.
