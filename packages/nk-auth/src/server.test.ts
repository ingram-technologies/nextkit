import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthHelpers } from "./server";

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
) => createAuthHelpers({ api: { getSession: async () => value } }, options);

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

	it("requireUser redirects to the bare sign-in path when truly signed out", async () => {
		await expect(helpers(null).requireUser()).rejects.toMatchObject({
			to: "/login",
		});
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
});
