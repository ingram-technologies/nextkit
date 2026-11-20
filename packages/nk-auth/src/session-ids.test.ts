import { createIdRegistry, SHARED_ID_PREFIXES, uuidv7 } from "@ingram-tech/nk-db/id";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { passkey } from "@better-auth/passkey";
import { magicLink, organization } from "better-auth/plugins";
import { describe, expect, it } from "vitest";
import { encodeSessionIds, publicAuthIds, publicSessionIds } from "./session-ids.js";

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
		passkey: [],
	};
	const magicLinks: string[] = [];
	const auth = betterAuth({
		database: memoryAdapter(db),
		secret: "test-secret-that-is-at-least-32-characters",
		baseURL: "http://localhost:3000",
		emailAndPassword: { enabled: true },
		socialProviders: { google: { clientId: "id", clientSecret: "secret" } },
		advanced: { database: { generateId: () => uuidv7() } },
		plugins: [
			organization(),
			passkey({ rpID: "localhost", origin: "http://localhost:3000" }),
			magicLink({
				sendMagicLink: async ({ token }) => void magicLinks.push(token),
			}),
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
	return { auth, db, call, cookie, signUp, magicLinks };
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
		const active = await call("/organization/set-active", {
			method: "POST",
			headers: { cookie },
			body: JSON.stringify({ organizationId: ids.organization.encode(orgId) }),
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

	it("leaves auth.api organization calls on raw uuids", async () => {
		const { auth, db, call, cookie } = await setup();
		await call("/organization/create", {
			method: "POST",
			headers: { cookie },
			body: JSON.stringify({ name: "Acme", slug: "acme" }),
		});
		const orgs = await auth.api.listOrganizations({
			headers: new Headers({ cookie }),
		});
		expect(orgs[0]?.id).toBe(rawId(db.organization));
	});
});

describe("publicSessionIds on accounts, passkeys and magic links", () => {
	const post = (body: unknown, cookie?: string): RequestInit => ({
		method: "POST",
		headers: cookie ? { cookie } : {},
		body: JSON.stringify(body),
	});

	it("returns public user ids from /list-accounts, the credential accountId included", async () => {
		const { db, call, cookie } = await setup();
		const userId = ids.user.encode(rawId(db.user));
		const res = await call("/list-accounts", { headers: { cookie } });
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject([
			{
				id: rawId(db.account),
				providerId: "credential",
				accountId: userId,
				userId,
			},
		]);
	});

	// A provider account owned by the signed-up user, with a live access token.
	const withGoogle = async () => {
		const ctx = await setup();
		const accountId = uuidv7();
		ctx.db.account?.push({
			id: accountId,
			userId: rawId(ctx.db.user),
			providerId: "google",
			accountId: "google-sub",
			accessToken: "ya29.token",
			accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		return { ...ctx, accountId, userId: ids.user.encode(rawId(ctx.db.user)) };
	};

	it("takes a public userId on /get-access-token and refuses a raw one", async () => {
		const { db, call, cookie, accountId, userId } = await withGoogle();
		const ok = await call("/get-access-token", post({ accountId, userId }, cookie));
		expect(ok.status).toBe(200);
		expect(await ok.json()).toMatchObject({ accessToken: "ya29.token" });

		const raw = await call(
			"/get-access-token",
			post({ accountId, userId: rawId(db.user) }, cookie),
		);
		expect(raw.status).toBe(400);
		expect(await raw.json()).toMatchObject({ message: "userId must be a usr_ id" });
	});

	it("refuses a raw userId on /refresh-token and /account-info", async () => {
		const { db, call, cookie, accountId } = await withGoogle();
		const raw = rawId(db.user);
		const refresh = await call(
			"/refresh-token",
			post({ accountId, userId: raw }, cookie),
		);
		expect(refresh.status).toBe(400);
		expect(await refresh.json()).toMatchObject({
			message: "userId must be a usr_ id",
		});
		const info = await call(`/account-info?accountId=${accountId}&userId=${raw}`, {
			headers: { cookie },
		});
		expect(info.status).toBe(400);
		expect(await info.json()).toMatchObject({
			message: "userId must be a usr_ id",
		});
	});

	it("returns public user ids from the passkey list and update", async () => {
		const { db, call, cookie } = await setup();
		const passkeyId = uuidv7();
		db.passkey?.push({
			id: passkeyId,
			name: "Laptop",
			userId: rawId(db.user),
			credentialID: "cred",
			publicKey: "key",
			counter: 0,
			deviceType: "singleDevice",
			backedUp: false,
			transports: "internal",
			createdAt: new Date(),
		});
		const userId = ids.user.encode(rawId(db.user));
		const list = await call("/passkey/list-user-passkeys", { headers: { cookie } });
		expect(list.status).toBe(200);
		expect(await list.json()).toMatchObject([{ id: passkeyId, userId }]);

		const updated = await call(
			"/passkey/update-passkey",
			post({ id: passkeyId, name: "Phone" }, cookie),
		);
		expect(updated.status).toBe(200);
		expect(await updated.json()).toMatchObject({
			passkey: { id: passkeyId, name: "Phone", userId },
		});
	});

	it("returns public user ids from /magic-link/verify", async () => {
		const { db, call, magicLinks } = await setup();
		const sent = await call("/sign-in/magic-link", post({ email: "a@b.com" }));
		expect(sent.status).toBe(200);
		const userId = ids.user.encode(rawId(db.user));
		const res = await call(`/magic-link/verify?token=${magicLinks[0]}`);
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({
			user: { id: userId },
			session: { userId },
		});
	});
});

describe("publicSessionIds on /organization/*", () => {
	const withOrg = async () => {
		const ctx = await setup();
		const created = await ctx.call("/organization/create", {
			method: "POST",
			headers: { cookie: ctx.cookie },
			body: JSON.stringify({ name: "Acme", slug: "acme" }),
		});
		const userId = ids.user.encode(rawId(ctx.db.user));
		const orgId = ids.organization.encode(rawId(ctx.db.organization));
		const memberId = rawId(ctx.db.member);
		return { ...ctx, created, userId, orgId, memberId };
	};

	it("returns public user and organization ids; member ids stay raw", async () => {
		const { created, userId, orgId, memberId } = await withOrg();
		expect(created.status).toBe(200);
		expect(await created.json()).toMatchObject({
			id: orgId,
			members: [{ id: memberId, userId, organizationId: orgId }],
		});
	});

	it("takes public ids in query and body", async () => {
		const { call, cookie, userId, orgId } = await withOrg();
		const full = await call(
			`/organization/get-full-organization?organizationId=${orgId}`,
			{ headers: { cookie } },
		);
		expect(full.status).toBe(200);
		expect(await full.json()).toMatchObject({
			id: orgId,
			members: [{ userId, organizationId: orgId, user: { id: userId } }],
		});

		const invite = await call("/organization/invite-member", {
			method: "POST",
			headers: { cookie },
			body: JSON.stringify({
				email: "c@d.com",
				role: "member",
				organizationId: orgId,
			}),
		});
		expect(invite.status).toBe(200);
		expect(await invite.json()).toMatchObject({
			organizationId: orgId,
			inviterId: userId,
		});

		const list = await call("/organization/list", { headers: { cookie } });
		expect(await list.json()).toMatchObject([{ id: orgId }]);
	});

	it("refuses a raw organization id", async () => {
		const { call, cookie, db } = await withOrg();
		const res = await call("/organization/set-active", {
			method: "POST",
			headers: { cookie },
			body: JSON.stringify({ organizationId: rawId(db.organization) }),
		});
		expect(res.status).toBe(400);
	});
});

describe("encodeSessionIds", () => {
	it("encodes every user and organization id field and keeps other values", () => {
		const userId = uuidv7();
		const orgId = uuidv7();
		const sessionId = uuidv7();
		const createdAt = new Date();
		const out = encodeSessionIds(
			{
				user: { id: userId, lastActiveOrganizationId: orgId, createdAt },
				session: { id: sessionId, userId, activeOrganizationId: orgId },
			},
			{ user: ids.user, organization: ids.organization },
		);
		expect(out).toEqual({
			user: {
				id: ids.user.encode(userId),
				lastActiveOrganizationId: ids.organization.encode(orgId),
				createdAt,
			},
			session: {
				id: sessionId,
				userId: ids.user.encode(userId),
				activeOrganizationId: ids.organization.encode(orgId),
			},
		});
	});
});

describe("publicAuthIds", () => {
	const withOrg = async () => {
		const ctx = await setup();
		await ctx.call("/organization/create", {
			method: "POST",
			headers: { cookie: ctx.cookie },
			body: JSON.stringify({ name: "Acme", slug: "acme" }),
		});
		const headers = new Headers({ cookie: ctx.cookie });
		const rawUser = rawId(ctx.db.user);
		const rawOrg = rawId(ctx.db.organization);
		return {
			...ctx,
			headers,
			rawOrg,
			userId: ids.user.encode(rawUser),
			orgId: ids.organization.encode(rawOrg),
			memberId: rawId(ctx.db.member),
		};
	};
	const sessionIds = { user: ids.user, organization: ids.organization };

	it("encodes an auth.api organization when told the value is one", async () => {
		const { auth, headers, rawOrg, userId, orgId, memberId } = await withOrg();
		const full = await auth.api.getFullOrganization({
			headers,
			query: { organizationId: rawOrg },
		});
		expect(full?.id).toBe(rawOrg);
		expect(
			publicAuthIds(full, sessionIds, { entity: "organization" }),
		).toMatchObject({
			id: orgId,
			members: [
				{ id: memberId, userId, organizationId: orgId, user: { id: userId } },
			],
		});

		const list = await auth.api.listOrganizations({ headers });
		expect(
			publicAuthIds(list, sessionIds, { entity: "organization" }),
		).toMatchObject([{ id: orgId }]);
	});

	it("encodes members, invitations and sessions by field name alone", async () => {
		const { auth, headers, rawOrg, userId, orgId, memberId } = await withOrg();
		const members = await auth.api.listMembers({
			headers,
			query: { organizationId: rawOrg },
		});
		expect(publicAuthIds(members, sessionIds)).toMatchObject({
			members: [{ id: memberId, userId, organizationId: orgId }],
		});

		const invitation = await auth.api.createInvitation({
			headers,
			body: { email: "c@d.com", role: "member", organizationId: rawOrg },
		});
		const encoded = publicAuthIds(invitation, sessionIds);
		expect(encoded).toMatchObject({ organizationId: orgId, inviterId: userId });
		// An invitation's own id is Better Auth's, not a registry entity's.
		expect(encoded.id).toBe(invitation.id);

		const session = await auth.api.getSession({ headers });
		expect(publicAuthIds(session, sessionIds)).toMatchObject({
			user: { id: userId },
			session: { userId },
		});
	});

	it("is idempotent and leaves the input untouched", async () => {
		const { auth, headers, rawOrg, orgId } = await withOrg();
		const full = await auth.api.getFullOrganization({
			headers,
			query: { organizationId: rawOrg },
		});
		const once = publicAuthIds(full, sessionIds, { entity: "organization" });
		expect(publicAuthIds(once, sessionIds, { entity: "organization" })).toEqual(
			once,
		);
		expect(once?.id).toBe(orgId);
		expect(full?.id).toBe(rawOrg);
	});
});
