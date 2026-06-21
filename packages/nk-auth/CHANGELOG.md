# @ingram-tech/nk-auth

## 0.7.6

### Patch Changes

- Updated dependencies
  - @ingram-tech/nk-db@0.9.0

## 0.7.5

### Patch Changes

- Updated dependencies
  - @ingram-tech/nk-db@0.8.0

## 0.7.3

### Patch Changes

- 95a6b49: Make the shared TypeScript base emit valid Node ESM and enforce it. The base
  preset (`@ingram-tech/nk-dev/tsconfig/base.json`) used `moduleResolution:
"bundler"`, which silently tolerates extensionless relative imports in
  `"type": "module"` packages and emits them verbatim — invalid under Node ESM /
  Turbopack, and a recurring source of `ERR_MODULE_NOT_FOUND` ("Cannot find
  module './x'"). Switched the base to `module`/`moduleResolution: "nodenext"`, so
  tsc now errors (TS2835) on any extensionless relative import.

  This surfaced the same latent defect in three packages, now fixed by adding
  explicit `.js` extensions to their relative imports: nk-i18n, newsletter, and
  nk-auth (their published `dist` previously shipped extensionless ESM).

  App consumers are unaffected: the Next.js preset (`nextjs.json`) overrides back
  to `moduleResolution: "bundler"`, so app source still needs no `.js` extensions.
  nk-auth also overrides to "bundler" because it imports `next/server` /
  `next/headers` / `next/navigation`, whose type exports don't resolve under
  NodeNext — its relative imports still carry `.js`, so its dist is valid ESM.

  - @ingram-tech/nk-db@0.6.0

## 0.7.2

### Patch Changes

- Move the id codec down to `@ingram-tech/nk-db/id`; `@ingram-tech/nk-auth/id`
  now re-exports it, so the public API is unchanged. The typed prefix registry
  `createIdRegistry()` is available from `@ingram-tech/nk-db/id`. Requires
  `@ingram-tech/nk-db@^0.5.0`.
- Updated dependencies
  - @ingram-tech/nk-db@0.5.0

## 0.7.1

### Patch Changes

- Updated dependencies [fdb7983]
  - @ingram-tech/nk-db@0.4.0

## 0.7.0

### Minor Changes

- d9f85fb: Stale sessions now self-heal, and sign-in returns the user to where they were
  headed.

  - `createAuthMiddleware` preserves the requested path as `?next=` when it
    redirects an unauthenticated user, injects an `x-nk-auth-path` header so server
    guards can do the same, and — on the `?stale=1` marker the guard adds for a
    present-but-invalid cookie — deletes the dead Better Auth cookies so a bad
    session is cleared instead of failing every request. New optional
    `sessionCookiePrefix` config (default `better-auth`).
  - `createAuthHelpers` gains an options arg (`signInPath`, `sessionCookiePrefix`).
    `requireUser` / `requireSession` now build the sign-in redirect automatically
    with `next` (from the header) and `stale=1` (when a session cookie is present
    but invalid) — so they **no longer take a `redirectTo` argument**. Also exports
    `safeNext` to validate a `?next=` param against open redirects.

  Breaking: `requireUser(redirectTo)` / `requireSession(redirectTo)` lost their
  parameter; set the destination via the `signInPath` option instead, and let
  `next` be derived automatically.

## 0.6.0

### Minor Changes

- `createAuthHelpers` now also returns `requireSession(redirectTo?)` — like
  `requireUser` but returns the full validated session, for callers that need the
  session id or active organization, not just the user.

## 0.5.0

### Minor Changes

- 882aa9e: Add App Router route-gating helpers that make the classic auth redirect loop
  structurally impossible.

  - `@ingram-tech/nk-auth/server` — `createAuthHelpers(auth)` returns validated,
    DB-backed `getSession` / `getUser` / `requireUser` / `redirectIfAuthenticated`,
    bound once to the site's Better Auth instance (generic over the site's session
    type, so the user shape stays fully inferred).
  - `@ingram-tech/nk-auth/middleware` — `createAuthMiddleware(config)` is a
    loop-safe edge middleware: it only redirects _cookie-less_ requests off
    `protectedPaths`, and optionally cookie-bearing requests off a front door. It
    refuses, at construction, to protect or front-door the sign-in path — the one
    optimistic redirect that lets a stale/revoked cookie ping-pong with the
    validated server guard forever.

  Adds `next` as an optional peer dependency (the new subpaths import it; the
  framework-agnostic core entry still does not).

## 0.4.1

### Patch Changes

- 5e1fab2: Bump the bundled `bcrypt` dependency from v5 to v6. Internal change only —
  the hash format is unchanged, so existing password hashes continue to verify.
- Updated dependencies [5e1fab2]
- Updated dependencies [5e2c767]
  - @ingram-tech/nk-db@0.3.0

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
