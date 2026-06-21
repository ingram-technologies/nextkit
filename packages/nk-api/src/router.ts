/**
 * `createRouter` — the OpenAPIHono a route module should use instead of
 * `new OpenAPIHono()`.
 *
 * It bakes in two things every router needs and is easy to forget:
 *
 *  1. **`onError`.** A mounted `OpenAPIHono` sub-app handles a thrown error
 *     *itself* and does NOT bubble it to the parent app's `onError`. So without
 *     a per-router handler, every `HttpError` a handler throws renders as a bare
 *     500 instead of the standard envelope. `createRouter` attaches it.
 *  2. **`defaultHook`.** A Zod request-validation failure is thrown as an
 *     `HttpError(400)` so it renders through the same single envelope path as
 *     every other error, not the library's raw `{ success: false }` body.
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import type { Env, ErrorHandler } from "hono";
import { handleError, HttpError } from "./errors.js";

export interface CreateRouterOptions<E extends Env> {
	/** Override the error renderer (must match the root app's, since sub-app
	 *  errors don't bubble). Defaults to nk-api's standard-envelope handler. */
	onError?: ErrorHandler<E>;
}

/** A new `OpenAPIHono<E>` with the standard validation hook + error handler
 *  wired. Chain `.openapi(route, handler)` on it as usual. */
export function createRouter<E extends Env = Env>(options?: CreateRouterOptions<E>) {
	const app = new OpenAPIHono<E>({
		defaultHook: (result) => {
			if (!result.success) {
				throw new HttpError(400, "Validation failed", result.error.issues);
			}
		},
	});
	app.onError(options?.onError ?? handleError);
	return app;
}
