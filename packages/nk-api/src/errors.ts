/**
 * The single error envelope for an nk-api app: `{ error, details? }`. Kept
 * deliberately flat so it's drop-in for clients that previously read PostgREST /
 * plain Next route-handler errors (`{ error: string }`).
 *
 * Handlers and middleware throw {@link HttpError}; the app's `onError` (wired by
 * `createApiApp` / `createRouter`) renders it to this envelope. Anything that
 * isn't an `HttpError` is an unhandled crash → logged + rendered as a 500.
 */
import { z } from "@hono/zod-openapi";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** The standard error envelope schema, registered as `Error` in the OpenAPI doc. */
export const ErrorSchema = z
	.object({
		error: z.string().openapi({ example: "Unauthorized" }),
		details: z.unknown().optional(),
	})
	.openapi("Error");

/** A reusable OpenAPI response entry for an error status. */
export const errorResponse = (description: string) => ({
	content: { "application/json": { schema: ErrorSchema } },
	description,
});

/**
 * The standard error responses to spread into a `createRoute`'s `responses`,
 * picking only the ones a handler can actually return. Reuse verbatim so the
 * emitted spec stays uniform across the fleet.
 */
export const errorResponses = {
	400: errorResponse("Malformed or invalid request."),
	401: errorResponse("Missing or invalid authentication."),
	403: errorResponse("Insufficient permissions."),
	404: errorResponse("Resource not found."),
	409: errorResponse("Conflict (e.g. a duplicate or in-use resource)."),
	422: errorResponse("A request shape or domain rule was violated."),
} as const;

/** A reusable OpenAPI response entry for a JSON success body. */
export const jsonContent = <T extends z.ZodType>(schema: T, description: string) => ({
	content: { "application/json": { schema } },
	description,
});

/** A JSON request body entry for a `createRoute`'s `request.body`. */
export const jsonBody = <T extends z.ZodType>(schema: T) => ({
	content: { "application/json": { schema } },
});

/**
 * Throw from a handler or middleware to return a specific status with the
 * standard envelope. Caught by the app's `onError`, so handlers use guard
 * clauses instead of threading error returns through every branch.
 */
export class HttpError extends Error {
	constructor(
		readonly status: ContentfulStatusCode,
		message: string,
		readonly details?: unknown,
	) {
		super(message);
		this.name = "HttpError";
	}
}

/** How an nk-api app reports an unhandled (non-`HttpError`) crash. */
export type ErrorLogger = (err: unknown, c: Context) => void;

let activeDefaultLogger: ErrorLogger = (err) =>
	console.error("[nk-api] unhandled error:", err);

/**
 * Override the logger used for unhandled (non-`HttpError`) 500s by `handleError`
 * and any `createErrorHandler()` left without an explicit logger. Call once at
 * startup (e.g. to forward crashes to Sentry/GlitchTip or your app logger) so you
 * do not have to thread a custom `onError` into `createApiApp` *and* every
 * `createRouter` — a mounted router does not bubble errors to the parent, so this
 * shared default is what keeps their crash logging consistent.
 */
export function setDefaultErrorLogger(logger: ErrorLogger): void {
	activeDefaultLogger = logger;
}

// Delegates at call time, so `setDefaultErrorLogger` applies even to handlers
// (like the module-level `handleError`) created before it runs.
const defaultLogger: ErrorLogger = (err, c) => activeDefaultLogger(err, c);

/**
 * Build a Hono `onError` handler that renders `HttpError` to the standard
 * envelope and everything else to a logged 500. Pass your own `logger` (e.g. a
 * Sentry/GlitchTip capture) to report crashes; defaults to the logger set by
 * {@link setDefaultErrorLogger} (initially `console.error`).
 */
export function createErrorHandler(logger: ErrorLogger = defaultLogger) {
	return (err: Error, c: Context): Response => {
		if (err instanceof HttpError) {
			return c.json({ error: err.message, details: err.details }, err.status);
		}
		logger(err, c);
		return c.json({ error: "Internal server error" }, 500);
	};
}

/** The default error handler (logs unhandled crashes via `console.error`). */
export const handleError = createErrorHandler();
