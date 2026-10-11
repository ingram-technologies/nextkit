import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createIdRegistry, uuidv7 } from "@ingram-tech/nk-db/id";
import { createTestDb, type TestDb } from "@ingram-tech/nk-db/pglite";
import {
	AUTH_MIGRATIONS_TABLE,
	AuthChainNotAppliedError,
	authMigrationsFolder,
} from "./chain.js";
import { createAuthHelpers, encodeSessionIds } from "./server.js";

// Request-scoped reads the helpers depend on; reset per test.
let headerStore = new Headers();
let cookieList: { name: string; value: string }[] = [];

vi.mock("next/headers", () => ({
	headers: async () => headerStore,
	cookies: async () => ({ getAll: () => cookieList }),
}));

// Model next/navigation's redirect(): it throws a `never`-typed control-flow
// signal. We throw a recognizable error so tests can assert the destination.
class RedirectSignal extends Error {
	constructor(readonly to: string) {
		super(`redirect:${to}`);
	}
}
vi.mock("next/navigation", () => ({
	redirect: (to: string) => {
		throw new RedirectSignal(to);
	},
}));

beforeEach(() => {
	headerStore = new Headers();
	cookieList = [];
});

/** A sign-in destination, parsed: the path and the two params the guards set. */
const target = (to: string) => {
	const url = new URL(to, "http://h");
	return {
		pathname: url.pathname,
		next: url.searchParams.get("next"),
		stale: url.searchParams.get("stale"),
	};
};

const session = { user: { id: "u1", email: "a@b.com" }, session: { id: "s1" } };
const helpers = (
	value: typeof session | null,
	options?: Parameters<typeof createAuthHelpers>[1],
	accounts: Array<{ providerId: string }> = [],
) =>
	createAuthHelpers(
		{
			api: {
				getSession: async () => value,
				listUserAccounts: async () => accounts,
			},
		},
		options,
	);

describe("createAuthHelpers with ids", () => {
	const ids = createIdRegistry({ user: "usr", organization: "org" });
	const userId = uuidv7();
	const orgId = uuidv7();
	const raw = {
		user: { id: userId, email: "a@b.com" },
		session: { id: "s1", userId, activeOrganizationId: orgId },
	};
	const withIds = () =>
		createAuthHelpers(
			{ api: { getSession: async () => raw, listUserAccounts: async () => [] } },
			{ ids: { user: ids.user, organization: ids.organization } },
		);

	it("presents user and organization ids in public form", async () => {
		const session = await withIds().getSession();
		expect(session?.user.id).toBe(ids.user.encode(userId));
		expect(session?.session.userId).toBe(ids.user.encode(userId));
		expect(session?.session.activeOrganizationId).toBe(
			ids.organization.encode(orgId),
		);
		expect((await withIds().getUser())?.id).toBe(ids.user.encode(userId));
		expect(raw.user.id).toBe(userId); // Better Auth's own object is untouched
	});

	it("leaves a null active organization alone and needs no organization helper", async () => {
		const { getSession } = createAuthHelpers(
			{
				api: {
					getSession: async () => ({
						user: { id: userId },
						session: { id: "s1", userId, activeOrganizationId: null },
					}),
					listUserAccounts: async () => [],
				},
			},
			{ ids: { user: ids.user } },
		);
		const session = await getSession();
		expect(session?.session.activeOrganizationId).toBeNull();
		expect(session?.session.userId).toBe(ids.user.encode(userId));
	});

	it("returns raw ids without a registry", async () => {
		const { getSession } = helpers({
			...session,
			user: { id: userId, email: "a@b.com" },
		});
		expect((await getSession())?.user.id).toBe(userId);
	});

	it("encodeSessionIds is idempotent", () => {
		const once = encodeSessionIds(raw, ids);
		expect(encodeSessionIds(once, ids)).toEqual(once);
	});
});

describe("createAuthHelpers", () => {
	it("getSession / getUser return the validated values", async () => {
		const { getSession, getUser } = helpers(session);
		expect(await getSession()).toEqual(session);
		expect(await getUser()).toEqual(session.user);
	});

	it("reads without refreshing, since a server component cannot set the cookie", async () => {
		const getSession = vi.fn(async () => session);
		await createAuthHelpers({
			api: { getSession, listUserAccounts: async () => [] },
		}).getSession();
		expect(getSession).toHaveBeenCalledWith(
			expect.objectContaining({ query: { disableRefresh: true } }),
		);
	});

	it("getUser returns null when signed out", async () => {
		expect(await helpers(null).getUser()).toBeNull();
	});

	it("requireUser returns the user when present", async () => {
		expect(await helpers(session).requireUser()).toBe(session.user);
	});

	it("requireUser redirects to the bare sign-in path when truly signed out, and says next was lost", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const h = helpers(null);
		await expect(h.requireUser()).rejects.toMatchObject({ to: "/login" });
		await expect(h.requireUser()).rejects.toMatchObject({ to: "/login" });
		// No x-nk-auth-path header: a wiring mistake, reported once per instance.
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]?.[0]).toMatch(/withAuthPathHeader/);
		warn.mockRestore();
	});

	it("does not warn when the header is present", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		headerStore = new Headers({ "x-nk-auth-path": "/memory" });
		await expect(helpers(null).requireUser()).rejects.toBeDefined();
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it("signInTarget carries next and stale for a site's own guard wrapper", async () => {
		headerStore = new Headers({ "x-nk-auth-path": "/memory?tab=a" });
		cookieList = [{ name: "better-auth.session_token", value: "dead" }];
		expect(target(await helpers(null).signInTarget())).toEqual({
			pathname: "/login",
			next: "/memory?tab=a",
			stale: "1",
		});
	});

	it("honors a custom nextParam and isSafeNext", async () => {
		headerStore = new Headers({ "x-nk-auth-path": "/memory" });
		const h = helpers(null, {
			nextParam: "redirectTo",
			isSafeNext: (v) => (v === "/memory" ? "/memory" : null),
		});
		const custom = new URL(await h.signInTarget(), "http://h");
		expect(custom.pathname).toBe("/login");
		expect(custom.searchParams.get("redirectTo")).toBe("/memory");
		expect(custom.searchParams.get("next")).toBeNull();
		headerStore = new Headers({ "x-nk-auth-path": "/other" });
		expect(
			target(await helpers(null, { isSafeNext: () => null }).signInTarget()),
		).toEqual({ pathname: "/login", next: null, stale: null });
	});

	it("requireUser redirects to signInTarget's destination (next + stale for a dead __Secure- cookie)", async () => {
		headerStore = new Headers({ "x-nk-auth-path": "/memory" });
		cookieList = [{ name: "__Secure-better-auth.session_token", value: "dead" }];
		const h = helpers(null);
		const expected = await h.signInTarget();
		expect(target(expected)).toEqual({
			pathname: "/login",
			next: "/memory",
			stale: "1",
		});
		await expect(h.requireUser()).rejects.toMatchObject({ to: expected });
	});

	it("honors a custom signInPath", async () => {
		await expect(
			helpers(null, { signInPath: "/signin" }).requireUser(),
		).rejects.toMatchObject({ to: "/signin" });
	});

	it("requireSession returns the full session when present", async () => {
		expect(await helpers(session).requireSession()).toBe(session);
	});

	it("requireSession redirects when signed out", async () => {
		await expect(helpers(null).requireSession()).rejects.toMatchObject({
			to: "/login",
		});
	});

	it("redirectIfAuthenticated redirects a signed-in user away", async () => {
		await expect(
			helpers(session).redirectIfAuthenticated("/dashboard"),
		).rejects.toMatchObject({ to: "/dashboard" });
	});

	it("redirectIfAuthenticated is a no-op when signed out (so /login renders)", async () => {
		await expect(
			helpers(null).redirectIfAuthenticated("/dashboard"),
		).resolves.toBeUndefined();
	});

	it("getLinkedProviders lists the current user's providerIds", async () => {
		const { getLinkedProviders } = helpers(session, undefined, [
			{ providerId: "google" },
			{ providerId: "credential" },
		]);
		expect(await getLinkedProviders()).toEqual(["google", "credential"]);
	});

	it("hasCredentialAccount is true when a credential account exists", async () => {
		const { hasCredentialAccount } = helpers(session, undefined, [
			{ providerId: "google" },
			{ providerId: "credential" },
		]);
		expect(await hasCredentialAccount()).toBe(true);
	});

	it("hasCredentialAccount is false for a social-only user (drives Set vs Change password)", async () => {
		const { hasCredentialAccount } = helpers(session, undefined, [
			{ providerId: "google" },
		]);
		expect(await hasCredentialAccount()).toBe(false);
	});
});

describe("createAuthHelpers chain check", () => {
	let lagging: TestDb;

	beforeAll(async () => {
		// The whole chain, then the newest journal row forgotten: the database a
		// site has when it deploys a new nk-auth before running db:migrate.
		lagging = await createTestDb({
			migrate: async () => {},
			dependencyMigrations: [
				{ folder: authMigrationsFolder(), table: AUTH_MIGRATIONS_TABLE },
			],
		});
		await lagging.pool.query(
			`delete from "drizzle"."${AUTH_MIGRATIONS_TABLE}" where created_at = (select max(created_at) from "drizzle"."${AUTH_MIGRATIONS_TABLE}")`,
		);
	});

	afterAll(async () => {
		await lagging?.close();
	});

	const onLagging = (options?: Parameters<typeof createAuthHelpers>[1]) => {
		const getSession = vi.fn(async () => session);
		const helpers = createAuthHelpers(
			{
				options: { database: lagging.pool },
				api: { getSession, listUserAccounts: async () => [] },
			},
			options,
		);
		return { helpers, getSession };
	};

	it("refuses to read a session on a database that lags the shipped chain", async () => {
		const { helpers, getSession } = onLagging();
		await expect(helpers.getSession()).rejects.toBeInstanceOf(
			AuthChainNotAppliedError,
		);
		expect(getSession).not.toHaveBeenCalled();
	});

	it("skips the check with chainCheck: false", async () => {
		const { helpers, getSession } = onLagging({ chainCheck: false });
		await expect(helpers.getSession()).resolves.toEqual(session);
		expect(getSession).toHaveBeenCalledTimes(1);
	});
});
