# @ingram-tech/nk-auth

## 0.15.0

### Minor Changes

- 907585f: Make `next` preservation composable, and loud when it is missing.
  
  Until now `?next=` only survived a sign-in redirect if a site adopted both
  `createAuthMiddleware` and `requireUser` verbatim: the middleware was the only
  thing that set the `x-nk-auth-path` header, the guard's sign-in URL builder was
  private, and a site that deviated from either lost `next` with no error. Every
  "sign in to see this page" landed on the default page instead.
  
  - `@ingram-tech/nk-auth/middleware` exports the two halves of the middleware on
    their own: `withAuthPathHeader(request, requestHeaders)` sets the header from
    a custom proxy in one line (the same `requestHeaders` shape as nk-i18n's
    `localeProxy`), and `clearStaleSession(request, config)` is the stale-cookie
    handshake. `createAuthMiddleware`'s middleware also accepts
    `{ requestHeaders }` so a site can forward its own headers through it.
  - `createAuthHelpers` exports `signInTarget()`, the sign-in URL with `next` and
    `stale` computed, so a site's own guard wrapper does
    `redirect(await signInTarget())` instead of re-deriving it.
  - Both accept `nextParam` (default `next`) and `isSafeNext` (default the
    internal-path validator), for a site with an existing param name or a
    trusted-origin allow-list.
  - Outside production, `signInTarget()` warns once when the header is absent,
    naming the two ways to wire it.

## 0.14.1

### Patch Changes

- 798b39d: Rewrite the READMEs for an outside reader. These packages are published under an
  open-source licence, but the prose addressed the reader as if they worked here:
  "the Ingram billing foundation", "every Ingram API looks the same", "the one
  shared email client for Ingram sites", "the fleet-uniform view". That framing is
  gone, along with the pose it came with — unsourceable claims ("the one SEO
  safeguard everyone forgets on Vercel"), negation-reframes, bold scattered on
  non-key phrases, and roughly forty mid-sentence em-dashes.
  
  Documented failure modes, gotchas and code examples are unchanged. No API,
  identifier, env var or technical claim was touched.
- Updated dependencies [798b39d]
  - @ingram-tech/nk-db@2.1.1

## 0.14.0

### Minor Changes

- 9314bf5: Session ids in public form. `createAuthHelpers(auth, { ids: { user, organization? } })`
  takes the site's registry helpers and presents `user.id`, `session.userId` and
  `session.activeOrganizationId` as public ids (`usr_…`, `org_…`) on every read
  through `getSession` / `getUser` / `requireSession` / `requireUser` — the same
  form nk-db 2's `idColumn` returns, so session ids compare with rows without a
  `publicId(...)` at each site. `encodeSessionIds` is exported for tests and
  custom readers. `backendJwtOptions({ audience, ids: { user } })` mints the
  backend JWT's `sub` and payload `id` the same way.
  
  Better Auth itself keeps working on raw uuids underneath, and values read
  straight from `auth.api.*` stay raw — the same rule as raw SQL vs `idColumn`.
  RLS needs no change: nk-db decodes a prefixed `sub` before it reaches
  `request.jwt.claims` (see its changeset).
  
  Without `ids`, nothing changes.

### Patch Changes

- Updated dependencies [9314bf5]
  - @ingram-tech/nk-db@2.1.0

## 0.13.6

### Patch Changes

- 9262afb: Publish `src/` alongside `dist/`, so the emitted `.js.map` and `.d.ts.map` files
  resolve. Bundlers no longer warn that "sourcemap points to missing source
  files", stack traces map back to real TypeScript, and go-to-definition lands on
  the annotated source instead of a generated `.d.ts`. Tests are excluded from the
  tarball.
- Updated dependencies [9278f83]
- Updated dependencies [9262afb]
  - @ingram-tech/nk-db@2.0.0

## 0.13.5

### Patch Changes

- e5a6f40: The id codec now lives in its own package, [`id758`](https://github.com/ingram-technologies/id758), which `@ingram-tech/nk-db` depends on. `@ingram-tech/nk-db/id` re-exports the whole `id758` surface, so existing imports keep working; `uuidGenerateId`, `toPrefixedId`, `fromPrefixedId` and `base58Id` are kept as deprecated aliases of `uuidv7`, `encodeId`, `decodeId` and `mintId`. One behaviour change inherited from `id758`: `fromPrefixedId` / `decodeId` now requires the full `prefix_<22 chars>` shape rather than decoding whatever follows the first underscore.
- Updated dependencies [e5a6f40]
  - @ingram-tech/nk-db@1.6.0

## 0.13.4

### Patch Changes

- ef86d0b: Tested against better-auth 1.7.0 (and `@better-auth/passkey` 1.7.0). nk-auth's
  own surface is unaffected — it uses core email/password and `signIn.social`,
  neither of which moved — so the peer range stays `^1.6.15` rather than rising
  to `^1.7.0`: sites can upgrade nk-auth without being forced onto 1.7.
  
  Sites that use the `genericOAuth` plugin do have a migration to do, and it is
  silent at build time:
  
  - `genericOAuth` no longer mounts its own endpoints. `auth.api.signInWithOAuth2({
    providerId })` is gone; the core `signInSocial({ provider })` replaces it.
  - The callback moved from `/api/auth/oauth2/callback/<provider>` to
    `/api/auth/callback/<provider>`, which means the redirect URI registered with
    the upstream provider has to be updated too.
  
  Note for `nk doctor`'s auth-shadow check: it derives plugin endpoints textually
  from better-auth's `dist/plugins`, and 1.7 still *contains* the old
  `createAuthEndpoint("/oauth2/callback/:providerId")` call even though the
  endpoint is no longer mounted. So a plugin-collision warning can now be stale
  for a second reason beyond "the plugin might not be enabled". These are
  warnings, never errors, so the check degrades gracefully — but do not read a
  plugin warning as proof the endpoint is live.
- 2b21f3a: Routine runtime dependency bumps: `jose` 6.2.9 (nk-auth), `stripe` 22.5.0
  (nk-billing), `intl-messageformat` 11.2.14 (nk-i18n), and `@wrksz/themes` 1.2.0
  (nk-themes). No API changes in any of them — the `@wrksz/themes` minor is
  purely additive (new `./client/use-hydrated` and `./script` subpath exports,
  neither re-exported by nk-themes today).
- f953443: `authBasePath` docs: note that a page matching a Better Auth endpoint shadows
  it (static segments beat the `[...all]` catch-all) and that `nk doctor` flags
  such collisions.
- Updated dependencies [3e6e51d]
  - @ingram-tech/nk-db@1.5.0

## 0.13.3

### Patch Changes

- 6cf2320: Raise runtime dependency floors to the current patch/minor releases.

  `nk-auth` moves to `jose` ^6.2.6, `nk-billing` to `stripe` ^22.4.0, `nk-i18n` to
  `intl-messageformat` ^11.2.13, and `nk-dev` to `oxlint` ^1.76.0, `knip` ^6.31.0
  and `@testing-library/jest-dom` ^6.10.0.

  No API changes. `nk-dev` ships the toolchain as real dependencies, so its bump
  is what moves a consuming site's linter and dead-code checker — the new `oxlint`
  reported no findings against this repo.

## 0.13.2

### Patch Changes

- bc027d5: Docs: auth links send from the default `notifications` local part, not
  `no-reply`. Auth mail is the first thing a user receives from a product and the
  mail they are most likely to answer ("I didn't request this", "this link is
  broken") — bouncing or silently dropping that reply is hostile at the worst
  possible moment. `fromAddress(displayName)` already defaults to `notifications`,
  so no code changes; the `no-reply` row is retired from the convention.

## 0.13.1

### Patch Changes

- 37e2aab: Export `AuthEmailKind`, `AuthEmailMessage` and `AuthEmailUser` from the package
  root. `makeEmailSenders` gained them in 0.13.0 but they were only reachable by
  deep-importing `./options.js`, so a site could not name the `kind` it switches on.

## 0.13.0

### Minor Changes

- 0aa46e5: `makeEmailSenders` now covers all three auth mails and hands your sender enough
  context to render a real, localized template.

  The message passed to `send` gains `kind` (`"verify-email" | "reset-password" |
"change-email"`), the full `user` (`id`, `email`, `name`), the raw `token`, the
  originating `request`, and `newEmail` on change-email. Existing senders that
  destructure `{ to, subject, url }` keep working unchanged.

  Adds **`sendChangeEmailConfirmation`**, so `user.changeEmail` no longer has to
  be hand-wired. That mattered more than it looks: `betterAuth()` receives its
  options through a generic, which switches **off** excess-property checking, so a
  callback under a wrong-but-plausible name — `sendChangeEmailVerification` is the
  one people reach for — compiles cleanly and never fires. Better Auth then falls
  through to sending the _verification_ mail to the **new** address, so the
  current address is never told the account is moving and the confirm-from-the-
  current-owner control silently does nothing. `options.ts` now pins all three
  callback names to the real Better Auth option types, so an upstream rename
  breaks nk-auth's build instead of quietly disabling a site's mail.

  Sites could previously only tell these mails apart by string-matching the
  English `subject`, and got no `user.id`, so auth mail could not be localized
  while every other message could. Switch on `kind` instead.

  The README's canonical example no longer shows `text: url, html: url` — a bare
  link reads as phishing on exactly the mails that need trust most. It now points
  at the registry's email components and the `no-reply` from-address convention.

### Patch Changes

- a98f265: Test files are now type-checked. Every package excluded `**/*.test.ts` from the
  one tsconfig it used for both building and type-checking, so `tsc` never looked
  at a single test — and vitest strips types without checking them, so nothing
  did. Type-level assertions in tests were silently dead.

  `tsconfig.json` now excludes only `node_modules` and `dist` (and is what
  `type-check` and your editor use); the new `tsconfig.build.json` adds the test
  globs back, so `dist` still ships no tests.

  Fixing the 49 errors this surfaced was mostly mechanical (missing `.js`
  extensions on relative imports, which the NodeNext base config has always
  required), but three were real:

  - **nk-auth** `migrations.test.ts` passed `migrationsTable`, which is not a
    `PgliteServerOptions` key and was silently ignored — the test applied its
    migration chain twice, once as a dependency chain and again as the default app
    chain. It now stubs the primary applier so it tests the shape it documents.
  - **nk-seo** `metadata.test.ts` read `.type` off the `OpenGraph` union, where it
    is only present on the variants.
  - **nk-i18n**'s missing-key tests pass keys an empty catalog types as `never`.
    They exercise the runtime missing-key policy, which exists for catalogs that
    drift at runtime, so they now carry an explicit `@ts-expect-error`.

- Updated dependencies [a98f265]
  - @ingram-tech/nk-db@1.4.2

## 0.12.3

### Patch Changes

- 74c0a40: Fix a false-positive startup error in `createAuthMiddleware`. The construction
  loop-safety check tested `signInPath.startsWith(protectedPath)`, a broader match
  than the per-request gate's segment-boundary check — so a safe config like
  `protectedPaths: ["/log"]` + `signInPath: "/login"` (or `protectedPaths: ["/"]`)
  threw even though `/login` is never actually gated. Both the guard and the
  request gate now share one segment-boundary `isProtected` predicate, so they
  can't drift. Genuine loops (`signInPath` equal to or nested under a protected
  path) still throw.

  Also documents that the legacy `bcryptPassword` preset silently truncates at
  bcrypt's 72-byte ceiling despite the 128-char policy — deliberately not
  length-guarded, since a guard would break verifying the legacy hashes it exists
  to support.

## 0.12.2

### Patch Changes

- b76d884: `createAuthHelpers`: memoize the validated session read per request with React `cache()`. A render fanning out many `getUser()` / `requireUser()` calls now validates the session against the database once per request instead of once per call (measured 9 → 1 validations on one consumer page render). Caveat: mutating the session mid-request and re-reading it through the helpers returns the pre-mutation snapshot; read `auth.api.getSession` directly in that case.
- Updated dependencies [af5209d]
  - @ingram-tech/nk-db@1.3.1

## 0.12.0

### Minor Changes

- 0aef304: Drop the `kysely@0.28.x` pin guidance. Better Auth's kysely adapter no longer imports `DEFAULT_MIGRATION_TABLE` from kysely's main entry (it mirrors the constant locally as of the v1.6.15 adapter, better-auth#9811), so kysely 0.29 no longer breaks the adapter or the Turbopack build. The `better-auth`/`@better-auth/passkey` peer floor is raised to `^1.6.15` to enforce that guarantee in the dependency range instead of in prose, and the README note is removed.
- c38b099: Add `authSecret()`, a standalone accessor for the session-signing secret that
  applies the same rule as `authEnv()` (strictly required in production, an
  insecure dev placeholder otherwise) without requiring `BETTER_AUTH_URL` or
  `DATABASE_URL`. Sites that derive their own `baseURL` and open their own
  database connection can now consume just the secret's prod/dev fallback instead
  of re-implementing that security-sensitive default in the app. `authEnv()` is
  unchanged and now composes the same underlying secret schema, so there is a
  single source of truth for the placeholder-vs-required behaviour.

## 0.11.1

### Patch Changes

- 1b1ca82: Security and correctness fixes across the gating slice:

  - `safeNext` / the middleware `next` param now reject backslashes and ASCII control characters. Browsers treat `\` as `/` in http(s) URLs and strip tab/newline while parsing, so values like `/\evil.com` or an encoded `/%09/evil.com` could previously be reflected into an off-origin redirect.
  - The stale-cookie self-heal now emits deletion cookies with the `Secure` attribute for `__Secure-`/`__Host-`-prefixed cookies. Browsers reject a non-Secure deletion of a prefixed cookie, so over HTTPS the dead session cookie was never actually cleared and the handshake re-ran on every visit.
  - `protectedPaths` match on segment boundaries: `"/app"` no longer gates `/application`.
  - `verifyBackendJwt` tolerates 5s of clock skew (jose defaults to 0, failing legitimate tokens at exp/nbf boundaries) and throttles the forced JWKS reload to once per 30s window, so requests with a made-up `kid` can no longer trigger unbounded refetches against the auth origin.
  - The packaged migration no longer creates the `pgcrypto` extension in a Supabase-specific `extensions` schema, which failed outright on plain Postgres/PGlite; `gen_random_uuid()` is core Postgres since v13, so the extension was unnecessary.
  - README: the route-handler example now uses `toNextJsHandler(auth)`; destructuring `auth.handler` (a plain function) yielded `GET = POST = undefined` and 405s on every auth endpoint.
  - `@ingram-tech/nk-db` is consumed via the `workspace:` protocol like every other internal dependency, and `build` cleans `dist/` first so removed modules can't ship in the tarball.

- Updated dependencies [c4eeaeb]
  - @ingram-tech/nk-db@1.2.0

## 0.11.0

### Minor Changes

- 3302e51: Fall back to an insecure `BETTER_AUTH_SECRET` placeholder outside production so
  local dev and tests run without hand-setting it.

  - When `NODE_ENV` is not `"production"`, a missing `BETTER_AUTH_SECRET` resolves
    to a well-known placeholder (`authEnv()` logs a one-time warning). This makes
    `nk dev` / plain `next dev` start with no auth setup, matching how `nk-db`
    supplies a local `DATABASE_URL`. The fallback lives in the owning package's env
    contract, not in the `nk` orchestrator.
  - In production the secret stays strictly required — a missing value still throws
    at startup, so a deploy can never sign sessions with a guessable secret.

## 0.10.0

### Minor Changes

- 1d9dcb9: Close the password reset/set loop so a site never touches Better Auth's
  `account` table or endpoint names directly.

  - `createAuthHelpers` gains `getLinkedProviders()` and `hasCredentialAccount()`
    (session-scoped, via Better Auth's `/list-accounts`). `hasCredentialAccount()`
    drives the "Change password" vs "Set password" decision on a security page: a
    social-only account has no email/password credential until it sets one.
  - New `useResetPassword(authClient, { token })` hook at
    `@ingram-tech/nk-auth/client` — the headless state machine for a token-consumer
    reset/set page (invalid-token, submitting, success, and length + match
    validation). The site brings its own shell; `error.code` is stable for i18n.
  - New pure `@ingram-tech/nk-auth/password` subpath (importable from both ends):
    `DEFAULT_MIN_PASSWORD_LENGTH` / `DEFAULT_MAX_PASSWORD_LENGTH`,
    `passwordSchema()`, `validateNewPassword()`, and `CREDENTIAL_PROVIDER_ID`, so
    the client form and the server validate against the same bounds.
  - `reset-password.test.ts` pins the Better Auth guarantee the set-password path
    relies on — `resetPassword` creates the `credential` account when the user has
    none — against a real instance, so an upstream upgrade can't silently break
    setting a password for a social-only account.
  - README §6 documents the whole flow, including the
    `.well-known/change-password` redirect convention for password managers.

## 0.9.1

### Patch Changes

- f14fdc4: Harden `verifyBackendJwt` against Better Auth signing-key rotation. jose's
  `createRemoteJWKSet` refuses to refetch the JWKS for its 30s cooldown after any
  fetch, so a token signed with a freshly rotated key (whose `kid` isn't yet in
  the cached set) failed for the whole cooldown window — surfacing as a ~30s burst
  of auth failures on every token-verifying request. On a `JWKSNoMatchingKey` miss
  we now force one `.reload()` (which bypasses the cooldown) and retry, so a
  rotation costs one extra fetch instead of a brief outage. Backward-compatible.
- Updated dependencies [f14fdc4]
  - @ingram-tech/nk-db@1.1.0

## 0.9.0

### Minor Changes

- 89268a8: Add `passkeyOptionsForBaseUrl(baseURL, rpName)`: derives the passkey plugin's
  `rpID` (the base URL's hostname — the WebAuthn effective domain, no scheme or
  port) and `origin` (the URL itself) from a single base URL, keeping them in
  lockstep. Covers the common single-origin site so consumers no longer hand-roll
  `new URL(baseURL).hostname`. Multi-origin / parent-registrable-domain sites
  still call `makePasskeyOptions` with explicit values.

### Patch Changes

- beb294e: Mark `bcryptPassword` as **legacy support only** (`@deprecated`): it exists
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

- Updated dependencies [beb294e]
  - @ingram-tech/nk-db@1.0.0

## 0.8.0

### Minor Changes

- Drop Supabase support entirely — the fleet is fully on Better Auth.

  **Breaking.** Removed:

  - `createServerSupabase` / `ServerSupabaseConfig` (the RLS-aware supabase-js data
    client) and the `./supabase` source module.
  - `rlsJwtOptions` — the Supabase RLS bridge `jwt`-plugin preset
    (`role: "authenticated"` token for PostgREST `auth.uid()`).
  - The `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars and
    the `supabaseUrl` / `supabaseAnonKey` fields on `AuthEnv` / `authEnv()`.
  - The `@supabase/supabase-js` (optional) peer dependency.

  **Migration:** access data over a direct `pg` connection and enforce per-request
  RLS with `withRls` / `withRlsTransaction` from
  [`@ingram-tech/nk-db`](https://github.com/ingram-technologies/nextkit/tree/main/packages/nk-db)
  — claims come from the Better Auth session, so `auth.uid()` policies fire
  unchanged with no JWT minting and no PostgREST. Drop the `jwt(rlsJwtOptions)`
  plugin and the `NEXT_PUBLIC_SUPABASE_*` env vars from your `betterAuth()` setup.
  The site's own backend-API token (`backendJwtOptions` / `verifyBackendJwt`) is
  unaffected.

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
