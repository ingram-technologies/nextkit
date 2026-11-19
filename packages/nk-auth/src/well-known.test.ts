import { describe, expect, it } from "vitest";
import { changePasswordRedirect, passkeyEndpoints } from "./well-known.js";

const request = new Request("https://preview-abc.example.dev/.well-known/x");

describe("passkeyEndpoints", () => {
	it("resolves both pages against the requesting host", async () => {
		const GET = passkeyEndpoints({ enroll: "/settings/security" });
		const res = GET(request);
		expect(res.headers.get("content-type")).toMatch(/application\/json/);
		expect(await res.json()).toEqual({
			enroll: "https://preview-abc.example.dev/settings/security",
			manage: "https://preview-abc.example.dev/settings/security",
		});
	});

	it("takes a separate manage page", async () => {
		const GET = passkeyEndpoints({ enroll: "/passkeys/new", manage: "/passkeys" });
		expect((await GET(request).json()).manage).toBe(
			"https://preview-abc.example.dev/passkeys",
		);
	});
});

describe("changePasswordRedirect", () => {
	it("redirects with a status the spec allows", () => {
		const res = changePasswordRedirect("/settings/security")(request);
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe(
			"https://preview-abc.example.dev/settings/security",
		);
	});
});
