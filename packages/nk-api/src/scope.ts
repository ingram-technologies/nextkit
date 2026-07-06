/**
 * `createResourceScope` — a resource/tenant authorization middleware factory,
 * the sibling of `createRequireAuth`. Multi-tenant APIs repeat the same shape on
 * every scoped route: validate the resource id in the path, resolve the caller's
 * role on that resource, enforce a minimum role, and expose both on the context.
 * This bakes that in; you supply only the role lookup (which can run under your
 * data layer / RLS) and the role hierarchy.
 *
 * ```ts
 * // src/api/http/org.ts
 * import { createResourceScope } from "@ingram-tech/nk-api";
 * import { z } from "@hono/zod-openapi";
 *
 * export const orgScope = createResourceScope({
 *   param: "organizationId",
 *   resolveRole: (user, id) => getOrgRole(user.id, id), // your RPC, under RLS
 *   hierarchy: ["read_only", "member", "admin", "owner"],
 *   validate: (v) => z.uuid().safeParse(v).success,
 * });
 *
 * // route middleware:
 * middleware: [requireAuth, orgScope("admin")] as const
 * ```
 */
import { createMiddleware } from "hono/factory";
import type { MiddlewareHandler } from "hono";

/**
 * The Hono env a resource scope reads (the authenticated `user`) and augments
 * (the resource id under your `param` name, plus the resolved `role`). Compose it
 * with your auth env, e.g.
 * `AuthEnv<User> & ResourceScopeEnv<User, Role, "organizationId">`.
 */
export type ResourceScopeEnv<User, Role extends string, Key extends string> = {
	Variables: { user: User } & { [P in Key]: string } & { role: Role };
};

export interface CreateResourceScopeOptions<
	User,
	Role extends string,
	Key extends string,
> {
	/** Path param holding the resource id, e.g. `"organizationId"`. */
	param: Key;
	/**
	 * Resolve the caller's role on the resource, or `null`/`undefined` for no
	 * access (rendered as 404, so the existence of a resource the caller can't see
	 * isn't leaked). Receives the authenticated user, so it can run under RLS.
	 */
	resolveRole: (user: User, resourceId: string) => Promise<Role | null | undefined>;
	/**
	 * Roles ordered low → high. Required to enforce a minimum role via
	 * `scope(minRole)`; omit for boolean access where any resolved role passes.
	 */
	hierarchy?: readonly Role[];
	/**
	 * Validate the raw param before resolving (e.g. a uuid check). Invalid → 400.
	 * Defaults to a non-empty check.
	 */
	validate?: (value: string) => boolean;
}

/**
 * Build a `scope(minRole?)` middleware factory bound to one resource + role
 * model. The middleware it returns:
 *
 *  1. reads the authenticated user from context — if absent (e.g. `requireAuth`
 *     was not chained before it) it returns **401** rather than crashing on an
 *     undefined user, removing the most common middleware-ordering footgun;
 *  2. validates the `param` (→ **400**);
 *  3. resolves the caller's role (→ **404** when none);
 *  4. enforces `minRole` against `hierarchy` (→ **403**);
 *  5. exposes the resource id (under `param`) and `role` on the context.
 */
export function createResourceScope<User, Role extends string, Key extends string>(
	options: CreateResourceScopeOptions<User, Role, Key>,
): (minRole?: Role) => MiddlewareHandler<ResourceScopeEnv<User, Role, Key>> {
	const { param, resolveRole, hierarchy } = options;
	const isValid = options.validate ?? ((value: string) => value.length > 0);

	return (minRole?: Role) => {
		// Fail closed at build time: a minRole that can't be ranked would otherwise
		// silently skip enforcement and let any resolved role through.
		if (minRole !== undefined) {
			if (!hierarchy) {
				throw new Error(
					`scope("${minRole}") requires a \`hierarchy\` in createResourceScope options`,
				);
			}
			if (!hierarchy.includes(minRole)) {
				throw new Error(`scope("${minRole}"): role is not in the hierarchy`);
			}
		}
		return createMiddleware<ResourceScopeEnv<User, Role, Key>>(async (c, next) => {
			const user = c.get("user") as User | undefined;
			if (!user) {
				return c.json({ error: "Unauthorized" }, 401);
			}

			const resourceId = c.req.param(param);
			if (!resourceId || !isValid(resourceId)) {
				return c.json({ error: `Invalid ${param}` }, 400);
			}

			const role = await resolveRole(user, resourceId);
			if (!role) {
				return c.json({ error: "Resource not found" }, 404);
			}

			if (minRole && hierarchy) {
				// A role missing from the hierarchy ranks as -1 and must deny, not
				// slip past the comparison.
				const roleRank = hierarchy.indexOf(role);
				if (roleRank === -1 || roleRank < hierarchy.indexOf(minRole)) {
					return c.json({ error: "Insufficient permissions" }, 403);
				}
			}

			// `c.set(param, ...)` won't narrow: indexing the mapped Variables type by
			// a generic `Key` keeps the value type abstract, so type the setter for
			// this one dynamic-key write. The value is a string by construction.
			(c.set as (key: Key, value: string) => void)(param, resourceId);
			c.set("role", role);
			await next();
			return undefined;
		});
	};
}
