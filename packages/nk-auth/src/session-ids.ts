/**
 * Public-form session ids, shared by the server helpers (`./server`) and the
 * `publicSessionIds` Better Auth plugin. Framework-agnostic: no `next` import,
 * so the plugin can live in the core entry.
 */
import type { IdHelper } from "@ingram-tech/nk-db/id";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { CREDENTIAL_PROVIDER_ID } from "./password.js";

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
	impersonatedBy: "user",
};

/** Keys whose object value is that entity, so its `id` is one. */
const ENTITY_KEYS: Readonly<Record<string, Entity>> = {
	user: "user",
	users: "user",
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

/**
 * The raw uuid Better Auth takes for a user's public id (`usr_…`): hand a
 * session's `user.id` back to `auth.api.*` or the adapter through this, not
 * through the codec. `ids` is the site's registry or a {@link SessionIds}.
 * Throws on anything but a `usr_` id, a raw uuid included.
 *
 *   await auth.api.getAccessToken({ body: { accountId, userId: authUserId(user.id, ids) } });
 */
export const authUserId = (publicId: string, ids: { user: IdHelper }): string =>
	ids.user.decode(publicId);

/** As {@link authUserId}, for an organization's public id (`org_…`). */
export const authOrganizationId = (
	publicId: string,
	ids: { organization: IdHelper },
): string => ids.organization.decode(publicId);

/**
 * A user's public id (`usr_…`) from the raw uuid Better Auth hands out where
 * {@link publicAuthIds} has no object to walk: an OAuth token's `sub`, a
 * hook's `user.id`. Idempotent.
 */
export const publicUserId = (rawId: string, ids: { user: IdHelper }): string =>
	ids.user.encode(rawId);

/**
 * Endpoints whose body names users by field (`user.id`, `session.userId`, a
 * record's `userId`) and whose own top-level `id`, if any, is not a user's:
 * every Better Auth endpoint (core and first-party plugins) that answers with
 * a session or user. The passkey registration options are deliberately
 * absent: their `user.id` is the WebAuthn user handle, not a user id.
 */
const USER_PATHS: ReadonlySet<string> = new Set([
	"/get-session",
	"/update-session",
	"/sign-in/email",
	"/sign-up/email",
	"/sign-in/social",
	"/sign-in/email-otp",
	"/sign-in/username",
	"/sign-in/phone-number",
	"/sign-in/anonymous",
	"/verify-email",
	"/change-password",
	"/list-sessions",
	"/list-accounts",
	"/magic-link/verify",
	"/email-otp/verify-email",
	"/phone-number/verify",
	"/one-tap/callback",
	"/one-time-token/verify",
	"/siwe/verify",
	"/two-factor/verify-totp",
	"/two-factor/verify-otp",
	"/two-factor/verify-backup-code",
	"/multi-session/list-device-sessions",
	"/multi-session/set-active",
	"/passkey/verify-authentication",
	"/passkey/verify-registration",
	"/passkey/list-user-passkeys",
	"/passkey/update-passkey",
	"/admin/create-user",
	"/admin/list-users",
	"/admin/list-user-sessions",
	"/admin/set-role",
	"/admin/ban-user",
	"/admin/unban-user",
	"/admin/impersonate-user",
	"/admin/stop-impersonating",
]);

/** Endpoints whose body is a user (the admin plugin's single-user reads). */
const USER_SELF_PATHS: ReadonlySet<string> = new Set([
	"/admin/get-user",
	"/admin/update-user",
]);

/** Endpoints that take a user id (body or query), and the field naming it. */
const USER_INPUT_FIELDS: Readonly<Record<string, string>> = {
	"/get-access-token": "userId",
	"/refresh-token": "userId",
	"/account-info": "userId",
	"/admin/get-user": "id",
	"/admin/update-user": "userId",
	"/admin/set-role": "userId",
	"/admin/ban-user": "userId",
	"/admin/unban-user": "userId",
	"/admin/list-user-sessions": "userId",
	"/admin/impersonate-user": "userId",
	"/admin/revoke-user-sessions": "userId",
	"/admin/remove-user": "userId",
	"/admin/set-user-password": "userId",
	"/admin/has-permission": "userId",
};

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
const ORGANIZATION_INPUT_FIELDS: ReadonlyArray<readonly [string, Entity]> = [
	["userId", "user"],
	["organizationId", "organization"],
];

const isOrganizationPath = (path: string) => path.startsWith("/organization/");

/**
 * A credential account's `accountId` is the user's own id, so `/list-accounts`
 * carries it in that field too. A provider account's `accountId` is the
 * provider's and stays as it is.
 */
const encodeCredentialAccountIds = (body: unknown, ids: SessionIds): unknown =>
	Array.isArray(body)
		? body.map((account) =>
				isPlainObject(account) && account.providerId === CREDENTIAL_PROVIDER_ID
					? {
							...account,
							accountId: encodeIfString(ids.user, account.accountId),
						}
					: account,
			)
		: body;

/**
 * A copy of `input` with its user and organization id `fields` decoded to raw
 * uuids. A value that is not that entity's public id is refused: the wire
 * carries one form.
 */
const decodeInput = (
	input: unknown,
	ids: SessionIds,
	fields: ReadonlyArray<readonly [string, Entity]>,
): unknown => {
	if (!isPlainObject(input)) return input;
	const out: Record<string, unknown> = { ...input };
	for (const [key, entity] of fields) {
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
 * Responses: every endpoint that answers with a session or user (every
 * sign-in and sign-up, `/get-session`, `/update-session`, `/verify-email`,
 * `/change-password`, the email-OTP, phone, magic-link, one-tap, one-time
 * token, SIWE, two-factor, multi-session, passkey and admin endpoints; see
 * `USER_PATHS`), `/list-accounts` (a credential account's `accountId` too)
 * and, with `ids.organization`, every `/organization/*` endpoint. Requests:
 * the user id of `/get-access-token`, `/refresh-token`, `/account-info` and
 * the admin endpoints, and an `/organization/*` call's `organizationId` /
 * `userId` (body or query), must be public ids and reach Better Auth
 * decoded. Member, invitation, team, account and passkey ids stay raw both
 * ways.
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
	const userInputHttp = (ctx: { request?: Request; path?: string }) =>
		ctx.request !== undefined &&
		ctx.path !== undefined &&
		Object.hasOwn(USER_INPUT_FIELDS, ctx.path);
	return {
		id: "nk-public-session-ids",
		hooks: {
			before: [
				{
					matcher: (ctx) => orgHttp(ctx) || userInputHttp(ctx),
					handler: createAuthMiddleware(async (ctx) => {
						const userField = USER_INPUT_FIELDS[ctx.path];
						const fields: ReadonlyArray<readonly [string, Entity]> =
							userField === undefined
								? ORGANIZATION_INPUT_FIELDS
								: [[userField, "user"]];
						return {
							context: {
								body: decodeInput(ctx.body, ids, fields),
								query: decodeInput(ctx.query, ids, fields),
							},
						};
					}),
				},
			],
			after: [
				{
					matcher: (ctx) =>
						ctx.request !== undefined &&
						ctx.path !== undefined &&
						(USER_PATHS.has(ctx.path) ||
							USER_SELF_PATHS.has(ctx.path) ||
							orgHttp(ctx)),
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
							: USER_SELF_PATHS.has(ctx.path)
								? "user"
								: undefined;
						const tree = encodeTree(returned, ids, self);
						const body =
							ctx.path === "/list-accounts"
								? encodeCredentialAccountIds(tree, ids)
								: tree;
						if (Array.isArray(body) || isPlainObject(body))
							return ctx.json(body);
					}),
				},
			],
		},
	};
}
