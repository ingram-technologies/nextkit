/**
 * Public-form session ids, shared by the server helpers (`./server`) and the
 * `publicSessionIds` Better Auth plugin. Framework-agnostic: no `next` import,
 * so the plugin can live in the core entry.
 */
import type { IdHelper } from "@ingram-tech/nk-db/id";
import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";

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

const encodeIfString = (helper: IdHelper | undefined, value: unknown): unknown =>
	helper && typeof value === "string" ? helper.encode(value) : value;

/**
 * A session with its ids in public form: `user.id`, `session.userId` and
 * `session.activeOrganizationId` (each only when present and a string). Pure:
 * Better Auth's own object is left untouched, since it is what the adapter
 * writes back. `encode` is idempotent, so an already-public id is unchanged.
 */
export function encodeSessionIds<S extends { user: unknown }>(
	session: S,
	ids: SessionIds,
): S {
	const out: Record<string, unknown> = { ...(session as Record<string, unknown>) };
	const user = session.user;
	if (user && typeof user === "object" && "id" in user) {
		out.user = { ...user, id: encodeIfString(ids.user, user.id) };
	}
	const inner = "session" in session ? session.session : undefined;
	if (inner && typeof inner === "object") {
		const rec = inner as Record<string, unknown>;
		out.session = {
			...rec,
			...("userId" in rec
				? { userId: encodeIfString(ids.user, rec.userId) }
				: {}),
			...("activeOrganizationId" in rec
				? {
						activeOrganizationId: encodeIfString(
							ids.organization,
							rec.activeOrganizationId,
						),
					}
				: {}),
		};
	}
	return out as S;
}

/**
 * The Better Auth endpoints whose response body is `{ user, session? }`, the
 * shape {@link encodeSessionIds} rewrites.
 */
const PUBLIC_SESSION_ID_PATHS: ReadonlySet<string> = new Set([
	"/get-session",
	"/sign-in/email",
	"/sign-up/email",
]);

const isSessionBody = (value: unknown): value is { user: unknown } =>
	typeof value === "object" &&
	value !== null &&
	!(value instanceof Response) &&
	!(value instanceof Error) &&
	"user" in value;

/**
 * Better Auth plugin: the session ids in Better Auth's own HTTP responses
 * (`/get-session`, `/sign-in/email`, `/sign-up/email`) in public form, so the
 * browser's `authClient.useSession()` sees the ids `createAuthHelpers({ ids })`
 * returns on the server.
 *
 *   plugins: [publicSessionIds({ ids: { user: ids.user, organization: ids.organization } })],
 *
 * Only HTTP response bodies change. Server-side `auth.api.*` calls, what the
 * adapter reads and writes, cookies and request inputs keep raw uuids. The
 * organization plugin's endpoints (`/organization/*`) are not rewritten:
 * their ids stay raw on the wire and their inputs take raw uuids.
 */
export function publicSessionIds(options: { ids: SessionIds }): BetterAuthPlugin {
	return {
		id: "nk-public-session-ids",
		hooks: {
			after: [
				{
					// `request` is set only when the call came through the HTTP
					// handler; `auth.api.*` calls have none and stay raw.
					matcher: (ctx) =>
						ctx.request !== undefined &&
						ctx.path !== undefined &&
						PUBLIC_SESSION_ID_PATHS.has(ctx.path),
					handler: createAuthMiddleware(async (ctx) => {
						const returned: unknown = ctx.context.returned;
						if (!isSessionBody(returned)) return;
						return ctx.json(encodeSessionIds(returned, options.ids));
					}),
				},
			],
		},
	};
}
