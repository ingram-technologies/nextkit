# @ingram-tech/nk-auth

## 0.4.0

### Minor Changes

- Add the base58 id codec on a new dependency-light `./id` subpath: `base58Id`,
  `toPrefixedId`, `fromPrefixedId` — a UUIDv7 rendered as a fixed-width 22-char
  Bitcoin-alphabet base58 body, matching the Ingram Cloud API's `agt_`/`smt_` ids
  (the same encoding of the same 16 bytes; cross-impl test vectors are shared).
  `uuidGenerateId` moves to `./id` too and is re-exported from the package root, so
  existing imports are unchanged. `./id` depends only on `node:crypto`, so a site
  can mint prefixed base58 ids without pulling bcrypt/passkey from `./options`.

### Patch Changes

- 258cd15: `createAuthPool` now delegates to `createPool` from the new `@ingram-tech/nk-db`
  dependency, so Better Auth and app queries share one pool implementation and TLS
  code path (the "one pool per process" rule). Its signature is unchanged. One
  behaviour change: connections to a local host (`127.0.0.1`/`localhost`) now cap
  at `max: 1` (required by the PGlite socket); non-local pools are unchanged.
- 0a8812a: Docs & comments: remove references to private product names (nextkit is open
  source — it describes the shared foundation generically, not the apps that
  consume it). No code or API changes.

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
