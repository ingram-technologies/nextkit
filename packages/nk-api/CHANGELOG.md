# @ingram-tech/nk-api

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
