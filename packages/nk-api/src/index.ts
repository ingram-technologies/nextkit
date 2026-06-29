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
} from "./errors.js";
export { createRouter, type CreateRouterOptions } from "./router.js";
export { createApiApp, type CreateApiAppOptions } from "./app.js";
export { createRequireAuth, type AuthEnv } from "./auth.js";
export {
	createResourceScope,
	type CreateResourceScopeOptions,
	type ResourceScopeEnv,
} from "./scope.js";
export {
	offsetFor,
	paginate,
	paginatedResponse,
	paginationMetaSchema,
	paginationQuery,
} from "./pagination.js";
export {
	checkRateLimit,
	getClientKey,
	rateLimit,
	type RateLimitOptions,
	type RateLimitResult,
} from "./rate-limit.js";
export { type HmacVerificationResult, verifyHmacSha256 } from "./webhooks.js";
