# @ingram-tech/nk-api

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
