import type { Pool } from "pg";

/**
 * Organization-plugin building blocks shared across Ingram sites. The site
 * still calls `organization({ ...nkOrganizationDefaults, ac, roles, ... })`
 * itself — these only supply the generic defaults + the active-org plumbing.
 */

/** Sensible Ingram defaults to spread into the `organization()` plugin. */
export const nkOrganizationDefaults = {
	/** Invitations valid for one week. */
	invitationExpiresIn: 60 * 60 * 24 * 7,
	/** The user who creates an org is its owner. */
	creatorRole: "owner",
} as const;

/**
 * `user.additionalFields` entry that records the user's last active org so it
 * can be restored on the next sign-in. Spread into `user.additionalFields`.
 */
export const lastActiveOrganizationUserField = {
	lastActiveOrganizationId: {
		type: "string",
		required: false,
		input: false,
		returned: true,
	},
} as const;

interface SessionLike {
	userId: string;
	activeOrganizationId?: string | null;
}

/**
 * `databaseHooks` that restore the user's last active organization on session
 * create (only if they're still a member) and persist it on session update.
 * Requires `lastActiveOrganizationUserField` in `user.additionalFields` and the
 * Better Auth organization tables. Spread as `databaseHooks: lastActiveOrganizationHooks(pool)`.
 */
export const lastActiveOrganizationHooks = (pool: Pool) => ({
	session: {
		create: {
			before: async (session: SessionLike) => {
				if (session.activeOrganizationId) {
					return;
				}
				const userResult = await pool.query<{
					lastActiveOrganizationId: string | null;
				}>('SELECT "lastActiveOrganizationId" FROM "user" WHERE id = $1', [
					session.userId,
				]);
				const lastOrgId = userResult.rows[0]?.lastActiveOrganizationId;
				if (!lastOrgId) {
					return;
				}
				const memberResult = await pool.query(
					'SELECT 1 FROM member WHERE "userId" = $1 AND "organizationId" = $2 LIMIT 1',
					[session.userId, lastOrgId],
				);
				if (memberResult.rows.length === 0) {
					return;
				}
				return { data: { ...session, activeOrganizationId: lastOrgId } };
			},
		},
		update: {
			after: async (session: SessionLike) => {
				const orgId = session.activeOrganizationId;
				if (typeof orgId !== "string" || !orgId) {
					return;
				}
				await pool.query(
					'UPDATE "user" SET "lastActiveOrganizationId" = $1 WHERE id = $2',
					[orgId, session.userId],
				);
			},
		},
	},
});
