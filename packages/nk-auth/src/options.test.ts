import { describe, expect, it } from "vitest";
import {
	type AuthEmailMessage,
	makeEmailSenders,
	passkeyOptionsForBaseUrl,
} from "./options.js";

describe("passkeyOptionsForBaseUrl", () => {
	it("derives rpID from the hostname and keeps the full URL as origin", () => {
		expect(passkeyOptionsForBaseUrl("https://example.com", "Example")).toEqual({
			rpID: "example.com",
			rpName: "Example",
			origin: "https://example.com",
		});
	});

	it("strips the scheme and port from rpID (the WebAuthn effective domain)", () => {
		// rpID is the bare host: no scheme, no port, no path. Getting this wrong
		// (e.g. leaving the :3000) silently breaks registration/auth, so pin it.
		const opts = passkeyOptionsForBaseUrl("http://localhost:3000", "Dev");
		expect(opts.rpID).toBe("localhost");
		expect(opts.origin).toBe("http://localhost:3000");
	});

	it("registers the bare origin when the base URL has a trailing slash or a path", () => {
		// The browser reports `https://example.com` as the ceremony origin and
		// WebAuthn compares it exactly, so the base URL's path must not leak in.
		for (const base of ["https://example.com/", "https://example.com/app/"]) {
			expect(passkeyOptionsForBaseUrl(base, "Example")).toMatchObject({
				rpID: "example.com",
				origin: "https://example.com",
			});
		}
		expect(passkeyOptionsForBaseUrl("http://localhost:3000/", "Dev").origin).toBe(
			"http://localhost:3000",
		);
	});

	it("uses the subdomain host, not the registrable domain", () => {
		// The single-origin helper does not climb to a parent domain — a site that
		// wants rpID "example.com" for "app.example.com" must call makePasskeyOptions.
		expect(passkeyOptionsForBaseUrl("https://app.example.com", "App").rpID).toBe(
			"app.example.com",
		);
	});

	it("throws on a non-URL base (a misconfigured env surfaces loudly)", () => {
		expect(() => passkeyOptionsForBaseUrl("not-a-url", "X")).toThrow();
	});
});

describe("makeEmailSenders", () => {
	it("routes each callback to the sender with its own kind, url and token", async () => {
		const sent: AuthEmailMessage[] = [];
		const senders = makeEmailSenders(async (m) => {
			sent.push(m);
		});
		const user = { id: "u1", email: "current@example.com", name: "Ada" };

		await senders.sendVerificationEmail({ user, url: "u", token: "t1" });
		await senders.sendResetPassword({ user, url: "r", token: "t2" });
		await senders.sendChangeEmailConfirmation({
			user,
			newEmail: "new@example.com",
			url: "c",
			token: "t3",
		});

		expect(sent.map((m) => [m.kind, m.url, m.token])).toEqual([
			["verify-email", "u", "t1"],
			["reset-password", "r", "t2"],
			["change-email", "c", "t3"],
		]);
		expect(sent.every((m) => m.user.id === "u1")).toBe(true);
	});

	it("addresses the change-email confirmation to the CURRENT address", async () => {
		// The whole point of the confirmation step: a hijacked session must not
		// be able to move the account without the current owner seeing it.
		let sent: AuthEmailMessage | undefined;
		const senders = makeEmailSenders(async (m) => {
			sent = m;
		});

		await senders.sendChangeEmailConfirmation({
			user: { id: "u1", email: "current@example.com" },
			newEmail: "attacker@example.com",
			url: "c",
			token: "t",
		});

		expect(sent?.to).toBe("current@example.com");
		expect(sent?.newEmail).toBe("attacker@example.com");
	});

	it("forwards the originating request so senders can read Accept-Language", async () => {
		let sent: AuthEmailMessage | undefined;
		const senders = makeEmailSenders(async (m) => {
			sent = m;
		});
		const request = new Request("https://example.com", {
			headers: { "accept-language": "fr-BE" },
		});

		await senders.sendVerificationEmail(
			{ user: { id: "u1", email: "a@example.com" }, url: "u", token: "t" },
			request,
		);

		expect(sent?.request?.headers.get("accept-language")).toBe("fr-BE");
	});
});
