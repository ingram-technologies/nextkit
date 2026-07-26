# @ingram-tech/nk-api

## 0.3.3

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

## 0.3.2

### Patch Changes

- 8eec90d: Bump `hono` 4.12.28→4.12.31 and `@hono/zod-openapi` 1.4→1.5.1 to latest.

## 0.3.1

### Patch Changes

- 7e4caa0: Harden the rate limiter, resource scopes, and client error parsing:

  - Each `rateLimit()` middleware instance now has its own bucket namespace, so two limiters sharing a client key no longer read and drain a single bucket (a strict limiter could previously be tripped by traffic that only hit a lax one, and one request could burn two tokens).
  - `checkRateLimit` with `limit <= 0` now admits nothing instead of leaking one request per window.
  - `getClientKey` caps client-controlled header values at 64 chars so spoofed `x-forwarded-for` values can't bloat the bucket map.
  - `scope(minRole)` now throws at build time when `createResourceScope` was given no `hierarchy` (previously it silently skipped role enforcement — fail open) or when `minRole` is not in the hierarchy, and a resolved role missing from the hierarchy is denied with 403.
  - `parseErrorBody` / `unwrap` / `assertResponseOk` no longer crash on a JSON body of `null` and ignore non-string `error` fields, always falling back to the provided message.

## 0.3.0

### Minor Changes

- f14fdc4: Add two primitives every API seam was re-implementing:

  - **Rate limiting** — `checkRateLimit` / `getClientKey` (framework-agnostic,
    zero-dep, per-instance fixed-window) plus a `rateLimit()` Hono middleware that
    emits the standard `429` envelope with `Retry-After` and `X-RateLimit-*`
    headers. The no-Redis default for cutting off single-client abuse.
  - **Webhook signature verification** — `verifyHmacSha256` does a length-checked,
    constant-time HMAC-SHA256 compare (hex or base64, optional `sha256=` prefix)
    for the `/internal/webhooks/<provider>` route class. Stripe keeps using its
    own SDK via `nk-billing`.

  Also adds `429` to the shared `errorResponses` map.

## 0.2.2

### Patch Changes

- beb294e: Docs/metadata only: reword the package description, README, and source comments
  to describe nk-api as the alternative to an auto-generated REST API rather than
  "a PostgREST-style auto API." No code change.

## 0.2.1

### Patch Changes

- Emit valid ESM: add explicit `.js` extensions to relative imports in the
  build output. The previous output used extensionless relative imports
  (`from "./errors"`), which Node's native ESM resolver and strict bundler
  resolution (e.g. Next.js/Turbopack when the package isn't bundled) reject
  with "module not found" — breaking consumers' production builds even though
  the package resolved fine under `bun`/`tsc`. Now matches `@ingram-tech/nk-db`.

## 0.2.0

### Minor Changes

- Add four ergonomics/correctness helpers driven by real consumer use:

  - **`createResourceScope`** — a resource/tenant authorization middleware factory
    (the sibling of `createRequireAuth`). You supply the role lookup + hierarchy; it
    validates the path param, resolves the caller's role, enforces a minimum role,
    and exposes the id + role on the context. Crucially, if it runs without
    `requireAuth` before it, it returns **401 instead of crashing** on an undefined
    user — the most common middleware-ordering footgun, removed by construction.
  - **`unwrap` (client)** — await a typed `hc` call and get its success body, or
    throw the envelope's `error`. Collapses the `if (res.ok) { … } else throw`
    narrowing dance every body-returning call would otherwise repeat. (`parseErrorBody`
    / `assertResponseOk` now accept any `{ json() }`, so typed `hc` responses work.)
  - **`setDefaultErrorLogger`** — set the crash logger once at startup so
    `createApiApp` and every `createRouter` report unhandled 500s the same way,
    without threading a custom `onError` into each (mounted routers don't bubble).
  - **Pagination** — `paginationQuery`, `paginatedResponse(itemSchema)`,
    `paginationMetaSchema`, `offsetFor()`, and `paginate()` so list endpoints don't
    re-derive the offset math and `{ data, pagination }` envelope.

  All additive; no breaking changes.

## 0.1.2

### Patch Changes

- Capture `createApiApp`'s `basePath` as a literal type (via a `const` type
  parameter) so the typed `hc` client can reconstruct the prefixed path
  (`hc<AppType>("/").api.v1...`). Previously `basePath` was typed as a wide
  `string`, which erased the literal and left the client routes inaccessible
  through the prefix.

## 0.1.1

### Patch Changes

- Make `@hono/swagger-ui` a regular dependency instead of a peer dependency. It's
  used only inside nk-api (`createApiApp`), so consumers shouldn't have to install
  it — and leaving it as a peer made it show up as an unused dependency in their
  lint/knip. `hono` and `@hono/zod-openapi` stay peers (the consumer imports them
  directly and must share a single instance).

## 0.1.0

### Minor Changes

- 830f03f: Add `@ingram-tech/nk-api`: the standard Hono + zod-openapi HTTP seam. Provides
  `createApiApp` (root app: validation envelope, onError, OpenAPI doc, Swagger UI,
  health), `createRouter` (per-router app with the validation hook **and** its own
  onError — mounted OpenAPIHono children don't bubble thrown errors to the parent),
  `HttpError`/`handleError`/`createErrorHandler`, `createRequireAuth` (auth
  middleware over a pluggable identity resolver), and the `jsonContent`/`jsonBody`/
  `errorResponse`/`errorResponses` helpers. Ships a Next.js adapter at
  `@ingram-tech/nk-api/next` (`createNextHandlers`) and a browser-safe typed client
  at `@ingram-tech/nk-api/client` (`hc`, `assertResponseOk`, `parseErrorBody`).
