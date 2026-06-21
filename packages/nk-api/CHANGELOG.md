# @ingram-tech/nk-api

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
