import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Guarantee test for the set-password-for-social-users path.
 *
 * `useResetPassword` (and every site's "Set password" card) leans on a Better
 * Auth implementation detail: `resetPassword` **creates** the `credential`
 * account when the user has none, rather than erroring. That single behaviour is
 * what lets a Google-only account gain a password through the forget-password
 * round trip. If a Better Auth upgrade ever regressed it, the OAuth set-password
 * flow would silently break — so we pin it here against a real instance.
 */

type Row = Record<string, unknown>;
let store: Record<string, Row[]>;

const SOCIAL_USER_ID = "social-user-1";
const SOCIAL_EMAIL = "social@example.com";

function seedSocialOnlyUser(): void {
	const now = new Date();
	store = {
		user: [
			{
				id: SOCIAL_USER_ID,
				name: "Social User",
				email: SOCIAL_EMAIL,
				emailVerified: true,
				createdAt: now,
				updatedAt: now,
			},
		],
		// A Google link and, crucially, NO "credential" account.
		account: [
			{
				id: "google-account-1",
				accountId: "google-abc",
				providerId: "google",
				userId: SOCIAL_USER_ID,
				createdAt: now,
				updatedAt: now,
			},
		],
		session: [],
		verification: [],
	};
}

function makeAuth(capture: { token?: string }) {
	return betterAuth({
		baseURL: "http://localhost:3000",
		secret: "test-secret-at-least-32-chars-long-000",
		database: memoryAdapter(store),
		emailAndPassword: {
			enabled: true,
			sendResetPassword: async ({ token }: { token: string }) => {
				capture.token = token;
			},
		},
	});
}

const credentialAccounts = () =>
	store.account.filter(
		(a) => a.providerId === "credential" && a.userId === SOCIAL_USER_ID,
	);

describe("resetPassword creates a credential for a social-only user", () => {
	beforeEach(() => {
		seedSocialOnlyUser();
	});

	it("has no credential account before the reset", () => {
		expect(credentialAccounts()).toHaveLength(0);
	});

	it("mints a credential account when the reset token is consumed", async () => {
		const capture: { token?: string } = {};
		const auth = makeAuth(capture);

		await auth.api.requestPasswordReset({ body: { email: SOCIAL_EMAIL } });
		expect(capture.token).toBeTruthy();

		await auth.api.resetPassword({
			body: {
				newPassword: "a-brand-new-password",
				token: capture.token as string,
			},
		});

		// The set-password path's whole premise: a credential now exists.
		expect(credentialAccounts()).toHaveLength(1);
		expect(credentialAccounts()[0]?.password).toBeTruthy();
	});
});
