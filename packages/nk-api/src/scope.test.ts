import { createRoute, z } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";
import { createApiApp } from "./app";
import { type AuthEnv, createRequireAuth } from "./auth";
import { jsonContent } from "./errors";
import { createRouter } from "./router";
import { createResourceScope, type ResourceScopeEnv } from "./scope";

type User = { id: string };
type Role = "read_only" | "member" | "admin" | "owner";
type Env = AuthEnv<User> & ResourceScopeEnv<User, Role, "orgId">;

const VALID = "11111111-1111-4111-8111-111111111111";

const orgScopeFor = (resolveRole: (user: User, id: string) => Promise<Role | null>) =>
	createResourceScope<User, Role, "orgId">({
		param: "orgId",
		resolveRole,
		hierarchy: ["read_only", "member", "admin", "owner"],
		validate: (v) => z.uuid().safeParse(v).success,
	});

const scopedRoute = createRoute({
	method: "get",
	path: "/orgs/{orgId}/thing",
	request: {
		params: z.object({
			orgId: z.uuid().openapi({ param: { name: "orgId", in: "path" } }),
		}),
	},
	responses: {
		200: jsonContent(z.object({ orgId: z.string(), role: z.string() }), "ok"),
		400: { description: "bad" },
		401: { description: "unauth" },
		403: { description: "forbidden" },
		404: { description: "missing" },
	},
});

const buildApp = (opts: {
	user: User | null;
	resolveRole: (user: User, id: string) => Promise<Role | null>;
	minRole?: Role;
}) => {
	const requireAuth = createRequireAuth(() => Promise.resolve(opts.user));
	const orgScope = orgScopeFor(opts.resolveRole);
	const routes = createRouter<Env>().openapi(
		{ ...scopedRoute, middleware: [requireAuth, orgScope(opts.minRole)] as const },
		(c) => c.json({ orgId: c.get("orgId"), role: c.get("role") }, 200),
	);
	return createApiApp<Env>({
		title: "T",
		version: "1.0.0",
		basePath: "/api/v1",
	}).route("/", routes);
};

describe("createResourceScope", () => {
	it("exposes the resource id and role on the context when access is allowed", async () => {
		const app = buildApp({
			user: { id: "u1" },
			resolveRole: () => Promise.resolve("owner"),
			minRole: "admin",
		});
		const res = await app.request(`/api/v1/orgs/${VALID}/thing`);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ orgId: VALID, role: "owner" });
	});

	it("403s when the role is below the required minimum", async () => {
		const app = buildApp({
			user: { id: "u1" },
			resolveRole: () => Promise.resolve("member"),
			minRole: "admin",
		});
		const res = await app.request(`/api/v1/orgs/${VALID}/thing`);
		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({ error: "Insufficient permissions" });
	});

	it("404s when the caller has no role on the resource", async () => {
		const app = buildApp({
			user: { id: "u1" },
			resolveRole: () => Promise.resolve(null),
		});
		const res = await app.request(`/api/v1/orgs/${VALID}/thing`);
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ error: "Resource not found" });
	});

	it("400s when the param fails validation", async () => {
		const app = buildApp({
			user: { id: "u1" },
			resolveRole: () => Promise.resolve("owner"),
		});
		const res = await app.request(`/api/v1/orgs/not-a-uuid/thing`);
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: "Invalid orgId" });
	});

	it("401s (via requireAuth) when unauthenticated", async () => {
		const app = buildApp({
			user: null,
			resolveRole: () => Promise.resolve("owner"),
		});
		const res = await app.request(`/api/v1/orgs/${VALID}/thing`);
		expect(res.status).toBe(401);
	});

	it("401s instead of crashing when the scope runs without requireAuth first", async () => {
		// The footgun: a scope chained without requireAuth would otherwise call
		// resolveRole with an undefined user and 500. It must 401 instead.
		const orgScope = orgScopeFor(() => Promise.resolve("owner"));
		const routes = createRouter<Env>().openapi(
			{ ...scopedRoute, middleware: [orgScope("admin")] as const },
			(c) => c.json({ orgId: c.get("orgId"), role: c.get("role") }, 200),
		);
		const app = createApiApp<Env>({
			title: "T",
			version: "1.0.0",
			basePath: "/api/v1",
		}).route("/", routes);
		const res = await app.request(`/api/v1/orgs/${VALID}/thing`);
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "Unauthorized" });
	});
});
