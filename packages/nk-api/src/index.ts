/**
 * `@ingram-tech/nk-api` — the standard Hono + zod-openapi HTTP seam.
 *
 * Core (framework-agnostic) entry. The Next.js adapter lives at
 * `@ingram-tech/nk-api/next` and the browser client at
 * `@ingram-tech/nk-api/client`, so neither pulls server-only code into the
 * wrong bundle.
 */
export {
	createErrorHandler,
	ErrorSchema,
	errorResponse,
	errorResponses,
	HttpError,
	handleError,
	jsonBody,
	jsonContent,
	setDefaultErrorLogger,
	type ErrorLogger,
} from "./errors";
export { createRouter, type CreateRouterOptions } from "./router";
export { createApiApp, type CreateApiAppOptions } from "./app";
export { createRequireAuth, type AuthEnv } from "./auth";
export {
	createResourceScope,
	type CreateResourceScopeOptions,
	type ResourceScopeEnv,
} from "./scope";
export {
	offsetFor,
	paginate,
	paginatedResponse,
	paginationMetaSchema,
	paginationQuery,
} from "./pagination";
