import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { FORM_GATED_AUTH_PATHS } from "./options.js";

// Pins the Better Auth behaviour FORM_GATED_AUTH_PATHS relies on: disabled
// paths refuse HTTP while the server-side API still runs.
describe("FORM_GATED_AUTH_PATHS", () => {
	const sent: string[] = [];
	const store: Record<string, Record<string, unknown>[]> = {
		user: [
			{
				id: "u1",
				name: "User",
				email: "user@example.com",
				emailVerified: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		],
		account: [],
		session: [],
		verification: [],
	};
	const auth = betterAuth({
		baseURL: "http://localhost:3000",
		secret: "test-secret-at-least-32-chars-long-000",
		database: memoryAdapter(store),
		disabledPaths: [...FORM_GATED_AUTH_PATHS],
		emailAndPassword: {
			enabled: true,
			sendResetPassword: async ({ user }) => {
				sent.push(user.email);
			},
		},
		emailVerification: { sendVerificationEmail: async () => {} },
	});

	it.each(FORM_GATED_AUTH_PATHS)("answers 404 over HTTP on %s", async (path) => {
		const response = await auth.handler(
			new Request(`http://localhost:3000/api/auth${path}`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "http://localhost:3000",
				},
				body: JSON.stringify({
					email: "user@example.com",
					password: "x".repeat(12),
					name: "X",
				}),
			}),
		);
		expect(response.status).toBe(404);
	});

	it("still serves the server-side API", async () => {
		await auth.api.requestPasswordReset({ body: { email: "user@example.com" } });
		expect(sent).toEqual(["user@example.com"]);
	});
});
