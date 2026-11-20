import { passkeyClient } from "./client-passkey.js";
import { createAuthClient } from "better-auth/react";
import { describe, expect, expectTypeOf, it } from "vitest";
import { type PasskeyAutofillClient, passkeyHostMatches } from "./passkey-autofill.js";

describe("passkeyHostMatches", () => {
	it("accepts the rp id and its subdomains, nothing else", () => {
		expect(passkeyHostMatches("example.com", "example.com")).toBe(true);
		expect(passkeyHostMatches("app.example.com", "example.com")).toBe(true);
		expect(passkeyHostMatches("badexample.com", "example.com")).toBe(false);
		expect(passkeyHostMatches("localhost", "example.com")).toBe(false);
	});
});

describe("PasskeyAutofillClient", () => {
	it("is satisfied by a real Better Auth client with passkeyClient()", () => {
		const client = createAuthClient({
			baseURL: "https://example.com",
			plugins: [passkeyClient()],
		});
		expectTypeOf(client).toExtend<PasskeyAutofillClient>();
	});
});
