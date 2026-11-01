import { fileURLToPath } from "node:url";
import { createTestDb, type TestDb } from "@ingram-tech/nk-db/pglite";
import { betterAuth } from "better-auth";
import { NextRequest, NextResponse } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthMiddleware, renewSession } from "./middleware.js";

// Renewal through a real Better Auth on the shipped chain: the property that
// matters is that an active person's session cookie keeps being re-issued, so
// nobody is signed out on a fixed timer.

const MIGRATIONS = fileURLToPath(new URL("../migrations", import.meta.url));
const BASE = "http://localhost:3000";
const DAY = 60 * 60 * 24;

let db: TestDb;
const makeAuth = (database: TestDb["pool"]) =>
	betterAuth({
		database,
		secret: "s".repeat(32),
		baseURL: BASE,
		basePath: "/auth",
		emailAndPassword: { enabled: true },
	});
let auth: ReturnType<typeof makeAuth>;

beforeAll(async () => {
	db = await createTestDb({
		migrate: async () => {},
		dependencyMigrations: [{ folder: MIGRATIONS, table: "__nkauth_migrations" }],
	});
	auth = makeAuth(db.pool);
});

afterAll(async () => {
	await db?.close();
});

/** A signed-in browser's session cookie, for a session last refreshed `ageDays` ago. */
const signedIn = async (email: string, ageDays: number): Promise<string> => {
	const response = await auth.api.signUpEmail({
		body: { email, password: "correct-horse-battery", name: "t" },
		asResponse: true,
	});
	const cookie = response.headers
		.getSetCookie()
		.find((c) => c.startsWith("better-auth.session_token="));
	if (!cookie) throw new Error("no session cookie");
	const now = Date.now();
	await db.pool.query(
		`update "session" set "updatedAt" = $1, "expiresAt" = $2
		 where "userId" = (select id from "user" where email = $3)`,
		[
			new Date(now - ageDays * DAY * 1000),
			new Date(now + (7 - ageDays) * DAY * 1000),
			email,
		],
	);
	return cookie.split(";")[0] ?? "";
};

const expiresAt = async (email: string): Promise<Date> => {
	const { rows } = await db.pool.query<{ expiresAt: Date }>(
		`select s."expiresAt" from "session" s join "user" u on u.id = s."userId" where u.email = $1`,
		[email],
	);
	const row = rows[0];
	if (!row) throw new Error("no session");
	return new Date(row.expiresAt);
};

const request = (cookie?: string) =>
	new NextRequest(new URL(`${BASE}/app`), {
		headers: cookie ? { cookie } : undefined,
	});

const setCookieNames = (response: NextResponse) =>
	response.headers.getSetCookie().map((c) => c.split("=")[0]);

describe("renewSession", () => {
	it("extends a session due for refresh and re-issues its cookie", async () => {
		const cookie = await signedIn("active@acme.test", 3);
		const before = await expiresAt("active@acme.test");
		const response = NextResponse.next();

		await renewSession(request(cookie), response, auth);

		expect(setCookieNames(response)).toContain("better-auth.session_token");
		expect(setCookieNames(response)).toContain("better-auth.renewed");
		const after = await expiresAt("active@acme.test");
		expect(after.getTime() - before.getTime()).toBeGreaterThan(2 * DAY * 1000);

		// The re-issued cookie is one the browser can sign in with, even after
		// the proxy sets a cookie of its own.
		response.cookies.set("site-pref", "x");
		const wire = response.headers
			.getSetCookie()
			.find((c) => c.startsWith("better-auth.session_token="));
		const session = await auth.api.getSession({
			headers: new Headers({ cookie: wire?.split(";")[0] ?? "" }),
		});
		expect(session?.user.email).toBe("active@acme.test");
	});

	it("does nothing within updateAge of the last check", async () => {
		const cookie = await signedIn("marked@acme.test", 3);
		const before = await expiresAt("marked@acme.test");
		const response = NextResponse.next();

		await renewSession(request(`${cookie}; better-auth.renewed=1`), response, auth);

		expect(response.headers.getSetCookie()).toEqual([]);
		expect(await expiresAt("marked@acme.test")).toEqual(before);
	});

	it("never loads auth for a request without a session", async () => {
		let loaded = false;
		const response = NextResponse.next();
		await renewSession(request(), response, async () => {
			loaded = true;
			return auth;
		});
		expect(loaded).toBe(false);
		expect(response.headers.getSetCookie()).toEqual([]);
	});

	it("leaves a dead session unmarked, for the server guard's stale handshake", async () => {
		const response = NextResponse.next();
		await renewSession(
			request("better-auth.session_token=not-a-session.sig"),
			response,
			auth,
		);
		expect(setCookieNames(response)).not.toContain("better-auth.renewed");
	});
});

describe("createAuthMiddleware with auth", () => {
	it("renews on a page it lets through", async () => {
		const cookie = await signedIn("gated@acme.test", 3);
		const middleware = createAuthMiddleware({ protectedPaths: ["/app"], auth });
		const response = await middleware(request(cookie));
		expect(setCookieNames(response)).toContain("better-auth.session_token");
	});
});
