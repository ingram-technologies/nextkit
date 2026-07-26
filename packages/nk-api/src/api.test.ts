import { createRoute, z } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";
import { createApiApp } from "./app.js";
import { createRequireAuth, type AuthEnv } from "./auth.js";
import { HttpError, jsonContent } from "./errors.js";
import { createRouter } from "./router.js";

// A router whose handlers throw — exercises the per-router onError gotcha: a
// mounted OpenAPIHono does NOT bubble thrown errors to the parent's onError, so
// createRouter must attach its own. If it doesn't, these render as bare 500s.
const throwingRoutes = createRouter()
	.openapi(
		createRoute({
			method: "get",
			path: "/boom",
			responses: { 404: { description: "nope" } },
		}),
		() => {
			throw new HttpError(404, "Not here", { hint: "gone" });
		},
	)
	.openapi(
		createRoute({
			method: "get",
			path: "/crash",
			responses: { 200: { description: "ok" } },
		}),
		() => {
			throw new Error("kaboom");
		},
	);

// A validated route to exercise the defaultHook → 400 envelope path.
const validatedRoutes = createRouter().openapi(
	createRoute({
		method: "get",
		path: "/echo",
		request: { query: z.object({ n: z.coerce.number().int() }) },
		responses: { 200: jsonContent(z.object({ n: z.number() }), "ok") },
	}),
	(c) => c.json({ n: c.req.valid("query").n }, 200),
);

const buildApp = () =>
	createApiApp({ title: "Test", version: "1.0.0", basePath: "/api/v1" })
		.route("/", throwingRoutes)
		.route("/", validatedRoutes);

describe("createApiApp + createRouter", () => {
	it("renders a thrown HttpError from a mounted router as the standard envelope", async () => {
		const app = buildApp();
		const res = await app.request("/api/v1/boom");
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({
			error: "Not here",
			details: { hint: "gone" },
		});
	});

	it("renders a non-HttpError crash as a 500 envelope", async () => {
		const app = buildApp();
		const res = await app.request("/api/v1/crash");
		expect(res.status).toBe(500);
		expect(await res.json()).toEqual({ error: "Internal server error" });
	});

	it("turns a Zod validation failure into a 400 envelope with details", async () => {
		const app = buildApp();
		const res = await app.request("/api/v1/echo?n=notanumber");
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string; details: unknown };
		expect(body.error).toBe("Validation failed");
		expect(Array.isArray(body.details)).toBe(true);
	});

	it("passes a valid request through to the handler", async () => {
		const app = buildApp();
		const res = await app.request("/api/v1/echo?n=42");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ n: 42 });
	});

	it("serves a health check and the OpenAPI document under the base path", async () => {
		const app = buildApp();
		expect(await (await app.request("/api/v1/health")).json()).toEqual({
			ok: true,
		});
		const doc = (await (await app.request("/api/v1/openapi.json")).json()) as {
			info: { title: string };
		};
		expect(doc.info.title).toBe("Test");
	});

	it("renders an unknown path as the 404 envelope", async () => {
		const app = buildApp();
		const res = await app.request("/api/v1/does-not-exist");
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ error: "Not found" });
	});
});

describe("createRequireAuth", () => {
	type User = { id: string };
	const protectedRoute = createRoute({
		method: "get",
		path: "/whoami",
		responses: { 200: jsonContent(z.object({ id: z.string() }), "ok") },
	});

	const buildAuthApp = (resolve: () => Promise<User | null>) => {
		const requireAuth = createRequireAuth(resolve);
		const routes = createRouter<AuthEnv<User>>().openapi(
			{ ...protectedRoute, middleware: [requireAuth] as const },
			(c) => c.json({ id: c.get("user").id }, 200),
		);
		return createApiApp<AuthEnv<User>>({
			title: "Auth",
			version: "1.0.0",
			basePath: "/api/v1",
		}).route("/", routes);
	};

	it("401s in the standard envelope when unauthenticated", async () => {
		const app = buildAuthApp(() => Promise.resolve(null));
		const res = await app.request("/api/v1/whoami");
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "Unauthorized" });
	});

	it("exposes the resolved user to the handler when authenticated", async () => {
		const app = buildAuthApp(() => Promise.resolve({ id: "user-1" }));
		const res = await app.request("/api/v1/whoami");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ id: "user-1" });
	});
});
