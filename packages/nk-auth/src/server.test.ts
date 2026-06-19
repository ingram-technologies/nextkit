import { describe, expect, it, vi } from "vitest";
import { createAuthHelpers } from "./server";

vi.mock("next/headers", () => ({
	headers: async () => new Headers(),
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

const session = { user: { id: "u1", email: "a@b.com" }, session: { id: "s1" } };
const helpers = (value: typeof session | null) =>
	createAuthHelpers({ api: { getSession: async () => value } });

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

	it("requireUser redirects to /login (default) when signed out", async () => {
		await expect(helpers(null).requireUser()).rejects.toMatchObject({
			to: "/login",
		});
	});

	it("requireUser honors a custom redirect target", async () => {
		await expect(helpers(null).requireUser("/signin")).rejects.toMatchObject({
			to: "/signin",
		});
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
