import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { sessionLifetime } from "./session-lifetime.js";

const DAY = 24 * 60 * 60;
const DAY_MS = DAY * 1000;

// A real instance on the memory adapter, so the clamp is exercised through
// Better Auth's own refresh path rather than a hand-called hook.
const setup = async () => {
	const db: Record<string, Array<Record<string, unknown>>> = {
		user: [],
		session: [],
		account: [],
		verification: [],
	};
	const auth = betterAuth({
		database: memoryAdapter(db),
		secret: "test-secret-that-is-at-least-32-characters",
		baseURL: "http://localhost:3000",
		emailAndPassword: { enabled: true },
		session: { expiresIn: 7 * DAY, updateAge: DAY },
		plugins: [sessionLifetime({ maxAge: 90 * DAY })],
	});
	const res = await auth.api.signUpEmail({
		body: { email: "a@b.com", password: "correct horse battery", name: "A" },
		asResponse: true,
	});
	const cookie = (res.headers.getSetCookie()[0] ?? "").split(";")[0] ?? "";
	const headers = new Headers({ cookie });
	const row = db.session?.[0];
	if (!row) throw new Error("sign-up created no session");
	// Signed in `ageDays` ago, last refreshed two days ago: a refresh is due.
	const age = (ageDays: number) => {
		const now = Date.now();
		row.createdAt = new Date(now - ageDays * DAY_MS);
		row.updatedAt = new Date(now - 2 * DAY_MS);
		row.expiresAt = new Date(now + 5 * DAY_MS);
		return row.createdAt as Date;
	};
	return { auth, headers, row, age };
};

describe("sessionLifetime", () => {
	it("slides a young session by expiresIn", async () => {
		const { auth, headers, row, age } = await setup();
		age(10);
		await auth.api.getSession({ headers });
		const expiresAt = (row.expiresAt as Date).getTime();
		expect(expiresAt).toBeGreaterThan(Date.now() + 7 * DAY_MS - 60_000);
	});

	it("never slides past createdAt + maxAge", async () => {
		const { auth, headers, row, age } = await setup();
		const createdAt = age(88);
		await auth.api.getSession({ headers });
		expect((row.expiresAt as Date).getTime()).toBe(
			createdAt.getTime() + 90 * DAY_MS,
		);
	});

	it("leaves the row alone when refresh is disabled", async () => {
		const { auth, headers, row, age } = await setup();
		age(10);
		const before = (row.expiresAt as Date).getTime();
		await auth.api.getSession({ headers, query: { disableRefresh: true } });
		expect((row.expiresAt as Date).getTime()).toBe(before);
	});
});
