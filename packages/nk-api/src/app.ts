/**
 * `createApiApp` — the root OpenAPIHono for a versioned HTTP API, the standard
 * replacement for a PostgREST-style auto API. Wires the cross-cutting concerns
 * once (validation envelope, `onError`, `notFound`, the OpenAPI document, Swagger
 * UI, a health check) and returns the app so the caller chains route modules:
 *
 * ```ts
 * const app = createApiApp({ title: "My API", version: "1.0.0", basePath: "/api/v1" })
 *   .route("/", accountRoutes)
 *   .route("/", organizationRoutes);
 * export type AppType = typeof app; // for the hc<AppType> typed client
 * ```
 *
 * Route chaining stays in the caller on purpose: the accumulated route types must
 * flow into `typeof app` for the typed client to work, so the factory must not
 * own `.route()`.
 */
import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { Env, ErrorHandler } from "hono";
import { handleError, HttpError } from "./errors";

export interface CreateApiAppOptions<E extends Env, BasePath extends string> {
	/** OpenAPI document title. */
	title: string;
	/** OpenAPI document version (e.g. "1.0.0"). */
	version: string;
	/** Mount prefix, e.g. "/api/v1". The doc, Swagger UI, and health check are
	 *  all served beneath it. Captured as a literal type (see `createApiApp`'s
	 *  `const BasePath`) so the typed `hc` client can reconstruct the path. */
	basePath: BasePath;
	/** OpenAPI document description. */
	description?: string;
	/** OpenAPI `servers` list (absolute URLs the spec advertises). */
	servers?: { url: string; description?: string }[];
	/** Path (under basePath) for the OpenAPI JSON document. Default "/openapi.json". */
	docPath?: string;
	/** Path (under basePath) for Swagger UI, or `false` to disable. Default "/docs". */
	swaggerPath?: string | false;
	/** Serve `GET {basePath}/health` → `{ ok: true }`. Default true. */
	health?: boolean;
	/** Override the error renderer. Defaults to nk-api's standard-envelope handler. */
	onError?: ErrorHandler<E>;
}

export function createApiApp<
	E extends Env = Env,
	const BasePath extends string = string,
>(options: CreateApiAppOptions<E, BasePath>) {
	const {
		title,
		version,
		basePath,
		description,
		servers,
		docPath = "/openapi.json",
		swaggerPath = "/docs",
		health = true,
		onError = handleError,
	} = options;

	const app = new OpenAPIHono<E>({
		defaultHook: (result) => {
			if (!result.success) {
				throw new HttpError(400, "Validation failed", result.error.issues);
			}
		},
	}).basePath(basePath);

	app.onError(onError);
	app.notFound((c) => c.json({ error: "Not found" }, 404));

	app.doc(docPath, {
		openapi: "3.1.0",
		info: { title, version, ...(description ? { description } : {}) },
		...(servers ? { servers } : {}),
	});

	if (swaggerPath) {
		app.get(swaggerPath, swaggerUI({ url: `${basePath}${docPath}` }));
	}

	if (health) {
		app.get("/health", (c) => c.json({ ok: true }));
	}

	return app;
}
