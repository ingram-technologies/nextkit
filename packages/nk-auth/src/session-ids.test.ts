import { createIdRegistry, SHARED_ID_PREFIXES, uuidv7 } from "@ingram-tech/nk-db/id";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { organization } from "better-auth/plugins";
import { describe, expect, it } from "vitest";
import { publicSessionIds } from "./session-ids.js";

const ids = createIdRegistry(SHARED_ID_PREFIXES);
const BASE = "http://localhost:3000/api/auth";

// A real instance on the memory adapter; every assertion goes through
// `auth.handler`, the path a browser's `authClient` takes.
const setup = async () => {
	const db: Record<string, Array<Record<string, unknown>>> = {
		user: [],
		session: [],
		account: [],
		verification: [],
		organization: [],
		member: [],
		invitation: [],
	};
	const auth = betterAuth({
		database: memoryAdapter(db),
		secret: "test-secret-that-is-at-least-32-characters",
		baseURL: "http://localhost:3000",
		emailAndPassword: { enabled: true },
		advanced: { database: { generateId: () => uuidv7() } },
		plugins: [
			organization(),
			publicSessionIds({
				ids: { user: ids.user, organization: ids.organization },
			}),
		],
	});
	const call = (path: string, init: RequestInit = {}) =>
		auth.handler(
			new Request(`${BASE}${path}`, {
				...init,
				headers: {
					"content-type": "application/json",
					origin: "http://localhost:3000",
					...init.headers,
				},
			}),
		);
	const signUp = await call("/sign-up/email", {
		method: "POST",
		body: JSON.stringify({
			email: "a@b.com",
			password: "correct horse battery",
			name: "A",
		}),
	});
	const cookie = (signUp.headers.getSetCookie()[0] ?? "").split(";")[0] ?? "";
	return { auth, db, call, cookie, signUp };
};

const rawId = (rows: Array<Record<string, unknown>> | undefined): string => {
	const id = rows?.[0]?.id;
	if (typeof id !== "string") throw new Error("no row");
	return id;
};

describe("publicSessionIds", () => {
	it("returns public ids from sign-up and get-session over HTTP", async () => {
		const { db, call, cookie, signUp } = await setup();
		const userId = rawId(db.user);
		expect((await signUp.json()).user.id).toBe(ids.user.encode(userId));

		const org = await call("/organization/create", {
			method: "POST",
			headers: { cookie },
			body: JSON.stringify({ name: "Acme", slug: "acme" }),
		});
		expect(org.status).toBe(200);
		const orgId = rawId(db.organization);
		// Request inputs and org endpoints stay raw.
		const active = await call("/organization/set-active", {
			method: "POST",
			headers: { cookie },
			body: JSON.stringify({ organizationId: orgId }),
		});
		expect(active.status).toBe(200);

		const res = await call("/get-session", { headers: { cookie } });
		const body = await res.json();
		expect(body).toMatchObject({
			user: { id: ids.user.encode(userId), email: "a@b.com" },
			session: {
				userId: ids.user.encode(userId),
				activeOrganizationId: ids.organization.encode(orgId),
			},
		});
	});

	it("returns public ids from sign-in", async () => {
		const { db, call } = await setup();
		const res = await call("/sign-in/email", {
			method: "POST",
			body: JSON.stringify({
				email: "a@b.com",
				password: "correct horse battery",
			}),
		});
		expect(res.status).toBe(200);
		expect((await res.json()).user.id).toBe(ids.user.encode(rawId(db.user)));
		expect(res.headers.getSetCookie().length).toBeGreaterThan(0);
	});

	it("leaves the adapter and auth.api calls on raw uuids", async () => {
		const { auth, db, cookie } = await setup();
		const userId = rawId(db.user);
		expect(userId).not.toMatch(/^usr_/);
		expect(db.session?.[0]?.userId).toBe(userId);
		const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
		expect(session?.user.id).toBe(userId);
		expect(session?.session.userId).toBe(userId);
	});

	it("passes a signed-out get-session through as null", async () => {
		const { call } = await setup();
		const res = await call("/get-session");
		expect(res.status).toBe(200);
		expect(await res.json()).toBeNull();
	});
});
