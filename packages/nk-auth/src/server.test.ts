import { beforeEach, describe, expect, it, vi } from "vitest";
import { createIdRegistry, uuidv7 } from "@ingram-tech/nk-db/id";
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
		expect(await getSession()).toBe(session);
		expect(await getUser()).toBe(session.user);
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

	it("signInTarget is exported for a site's own guard wrapper", async () => {
		headerStore = new Headers({ "x-nk-auth-path": "/memory?tab=a" });
		cookieList = [{ name: "better-auth.session_token", value: "dead" }];
		await expect(helpers(null).signInTarget()).resolves.toBe(
			"/login?next=%2Fmemory%3Ftab%3Da&stale=1",
		);
	});

	it("honors a custom nextParam and isSafeNext", async () => {
		headerStore = new Headers({ "x-nk-auth-path": "/memory" });
		const h = helpers(null, {
			nextParam: "redirectTo",
			isSafeNext: (v) => (v === "/memory" ? "/memory" : null),
		});
		await expect(h.signInTarget()).resolves.toBe("/login?redirectTo=%2Fmemory");
		headerStore = new Headers({ "x-nk-auth-path": "/other" });
		await expect(
			helpers(null, { isSafeNext: () => null }).signInTarget(),
		).resolves.toBe("/login");
	});

	it("requireUser preserves the requested path as next (from the injected header)", async () => {
		headerStore = new Headers({ "x-nk-auth-path": "/memory" });
		await expect(helpers(null).requireUser()).rejects.toMatchObject({
			to: "/login?next=%2Fmemory",
		});
	});

	it("requireUser flags stale=1 when a session cookie is present but invalid", async () => {
		headerStore = new Headers({ "x-nk-auth-path": "/memory" });
		cookieList = [{ name: "__Secure-better-auth.session_token", value: "dead" }];
		await expect(helpers(null).requireUser()).rejects.toMatchObject({
			to: "/login?next=%2Fmemory&stale=1",
		});
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
