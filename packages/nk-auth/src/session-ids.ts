/**
 * Public-form session ids, shared by the server helpers (`./server`) and the
 * `publicSessionIds` Better Auth plugin. Framework-agnostic: no `next` import,
 * so the plugin can live in the core entry.
 */
import type { IdHelper } from "@ingram-tech/nk-db/id";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";

/**
 * The registry helpers for the ids a session carries. With these, every
 * session read through the helpers presents `user.id` / `session.userId` as
 * the user's public id and `session.activeOrganizationId` as the
 * organization's, so app code compares session ids with `idColumn` reads in
 * one form. Better Auth itself keeps working on raw uuids underneath.
 */
export interface SessionIds {
	user: IdHelper;
	organization?: IdHelper;
}

type Entity = keyof SessionIds;

/** Fields that name a user or organization wherever they appear. */
const ID_FIELDS: Readonly<Record<string, Entity>> = {
	userId: "user",
	inviterId: "user",
	organizationId: "organization",
	activeOrganizationId: "organization",
	lastActiveOrganizationId: "organization",
};

/** Keys whose object value is that entity, so its `id` is one. */
const ENTITY_KEYS: Readonly<Record<string, Entity>> = {
	user: "user",
	organization: "organization",
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
	if (typeof value !== "object" || value === null) return false;
	const proto: unknown = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
};

const encodeIfString = (helper: IdHelper | undefined, value: unknown): unknown =>
	helper && typeof value === "string" ? helper.encode(value) : value;

/**
 * `value` with every user and organization id in public form. Ids are found
 * by field name (`userId`, `organizationId`, ...) and by the `id` of an
 * object under `user` / `organization`; `self` says what a top-level `id` is.
 * Member, invitation, team and session ids are left as they are, and so is
 * site-defined `metadata`.
 */
const encodeTree = (value: unknown, ids: SessionIds, self?: Entity): unknown => {
	if (Array.isArray(value)) return value.map((v) => encodeTree(v, ids, self));
	if (!isPlainObject(value)) return value;
	const out: Record<string, unknown> = {};
	for (const [key, v] of Object.entries(value)) {
		const field = ID_FIELDS[key];
		if (key === "id") out[key] = encodeIfString(self && ids[self], v);
		else if (field) out[key] = encodeIfString(ids[field], v);
		else if (key === "metadata") out[key] = v;
		else out[key] = encodeTree(v, ids, ENTITY_KEYS[key]);
	}
	return out;
};

/**
 * A session with its ids in public form: `user.id`, `session.userId`,
 * `session.activeOrganizationId` and any other user or organization id field
 * (`user.lastActiveOrganizationId`). Pure: Better Auth's own object is left
 * untouched, since it is what the adapter writes back. `encode` is
 * idempotent, so an already-public id is unchanged.
 */
export function encodeSessionIds<S extends { user: unknown }>(
	session: S,
	ids: SessionIds,
): S {
	return publicAuthIds(session, ids);
}

/**
 * A server-side Better Auth result with its user and organization ids in
 * public form, the same rewrite `publicSessionIds` applies to HTTP bodies.
 * `auth.api.*` calls bypass the plugin and return raw uuids; pass the result
 * through this instead of encoding ids by hand:
 *
 *   const org = publicAuthIds(
 *   	await auth.api.getFullOrganization({ headers }),
 *   	ids,
 *   	{ entity: "organization" },
 *   );
 *
 * Ids are found by field name (`userId`, `inviterId`, `organizationId`,
 * `activeOrganizationId`, `lastActiveOrganizationId`) and by the `id` of an
 * object under `user` / `organization`. A top-level `id` is encoded only when
 * `entity` says what the value is (an organization or a list of them, a
 * user). Member, invitation, team and session ids, and `metadata`, are left
 * as they are. Pure and idempotent.
 */
export function publicAuthIds<T>(
	value: T,
	ids: SessionIds,
	options: { entity?: Entity } = {},
): T {
	// The walker replaces id strings with id strings, so `value`'s shape is
	// kept; it returns `unknown` because it walks any tree.
	return encodeTree(value, ids, options.entity) as T;
}

/** Endpoints whose body is `{ user, session? }`. */
const SESSION_PATHS: ReadonlySet<string> = new Set([
	"/get-session",
	"/sign-in/email",
	"/sign-up/email",
	"/list-sessions",
]);

/** Organization endpoints whose body is an organization (or a list of them). */
const ORGANIZATION_PATHS: ReadonlySet<string> = new Set([
	"/organization/create",
	"/organization/update",
	"/organization/delete",
	"/organization/get-organization",
	"/organization/get-full-organization",
	"/organization/set-active",
	"/organization/list",
]);

/** Request fields an `/organization/*` call names a user or organization by. */
const INPUT_FIELDS: ReadonlyArray<readonly [string, Entity]> = [
	["userId", "user"],
	["organizationId", "organization"],
];

const isOrganizationPath = (path: string) => path.startsWith("/organization/");

/**
 * A copy of `input` with its `userId` / `organizationId` decoded to raw
 * uuids. A value that is not that entity's public id is refused: the wire
 * carries one form.
 */
const decodeInput = (input: unknown, ids: SessionIds): unknown => {
	if (!isPlainObject(input)) return input;
	const out: Record<string, unknown> = { ...input };
	for (const [key, entity] of INPUT_FIELDS) {
		const value = input[key];
		const helper = ids[entity];
		if (typeof value !== "string" || !helper) continue;
		const raw = helper.decodeOrNull(value);
		if (!raw) {
			throw new APIError("BAD_REQUEST", {
				message: `${key} must be a ${helper.prefix}_ id`,
			});
		}
		out[key] = raw;
	}
	return out;
};

/**
 * Better Auth plugin: user and organization ids in public form on Better
 * Auth's own HTTP surface, so the browser's `authClient` (`useSession()`,
 * `useActiveOrganization()`, `organization.*`) speaks the ids
 * `createAuthHelpers({ ids })` returns on the server.
 *
 *   plugins: [publicSessionIds({ ids: { user: ids.user, organization: ids.organization } })],
 *
 * Responses: the session endpoints (`/get-session`, `/sign-in/email`,
 * `/sign-up/email`, `/list-sessions`) and, with `ids.organization`, every
 * `/organization/*` endpoint. Requests: an `/organization/*` call's
 * `organizationId` / `userId` (body or query) must be public ids and reach
 * Better Auth decoded. Member, invitation and team ids stay raw both ways.
 *
 * Only HTTP traffic changes. Server-side `auth.api.*` calls, what the adapter
 * reads and writes, and cookies keep raw uuids; pass an `auth.api.*` result
 * through {@link publicAuthIds} for the public form.
 */
export function publicSessionIds(options: { ids: SessionIds }): BetterAuthPlugin {
	const { ids } = options;
	// `request` is set only when the call came through the HTTP handler;
	// `auth.api.*` calls have none and stay raw.
	const orgHttp = (ctx: { request?: Request; path?: string }) =>
		ids.organization !== undefined &&
		ctx.request !== undefined &&
		ctx.path !== undefined &&
		isOrganizationPath(ctx.path);
	return {
		id: "nk-public-session-ids",
		hooks: {
			before: [
				{
					matcher: orgHttp,
					handler: createAuthMiddleware(async (ctx) => ({
						context: {
							body: decodeInput(ctx.body, ids),
							query: decodeInput(ctx.query, ids),
						},
					})),
				},
			],
			after: [
				{
					matcher: (ctx) =>
						ctx.request !== undefined &&
						ctx.path !== undefined &&
						(SESSION_PATHS.has(ctx.path) || orgHttp(ctx)),
					handler: createAuthMiddleware(async (ctx) => {
						const returned: unknown = ctx.context.returned;
						if (
							returned === null ||
							typeof returned !== "object" ||
							returned instanceof Response ||
							returned instanceof Error
						) {
							return;
						}
						const self = ORGANIZATION_PATHS.has(ctx.path)
							? "organization"
							: undefined;
						const body = encodeTree(returned, ids, self);
						if (Array.isArray(body) || isPlainObject(body))
							return ctx.json(body);
					}),
				},
			],
		},
	};
}
