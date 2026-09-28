import type { BetterAuthPlugin } from "better-auth";

/**
 * A hard ceiling on how long one sign-in lasts, however active the user stays.
 * Better Auth's own session is sliding: each refresh (at most once per
 * `session.updateAge`) moves `expiresAt` to now + `session.expiresIn`, forever.
 * This clamps every refresh to `createdAt + maxAge`, so a session idles out
 * after `expiresIn` and ends outright `maxAge` after sign-in.
 *
 *   plugins: [sessionLifetime({ maxAge: 60 * 60 * 24 * 90 })],
 *
 * Suite apps sharing one session table must pass the same `maxAge`: whichever
 * instance refreshes the row applies its own.
 */
export function sessionLifetime(options: {
	/** Seconds from sign-in after which the session can no longer be refreshed. */
	maxAge: number;
}): BetterAuthPlugin {
	return {
		id: "nk-session-lifetime",
		init: () => ({
			options: {
				databaseHooks: {
					session: {
						update: {
							before: async (data, ctx) => {
								const createdAt =
									ctx?.context.session?.session.createdAt;
								if (!(data.expiresAt instanceof Date) || !createdAt) {
									return;
								}
								const ceiling = new Date(
									new Date(createdAt).getTime() +
										options.maxAge * 1000,
								);
								if (data.expiresAt > ceiling) {
									return { data: { ...data, expiresAt: ceiling } };
								}
							},
						},
					},
				},
			},
		}),
	};
}
