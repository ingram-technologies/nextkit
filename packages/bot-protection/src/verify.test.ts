import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { HONEYPOT_FIELD, TOKEN_FIELD } from "./fields";
import { createFormToken, verifyFormToken } from "./token";
import { verifyHuman } from "./verify";

const ORIGINAL = process.env.BOT_PROTECTION_SECRET;
beforeAll(() => {
	process.env.BOT_PROTECTION_SECRET = "test-secret-please-ignore";
});
afterAll(() => {
	process.env.BOT_PROTECTION_SECRET = ORIGINAL;
});

describe("verifyFormToken", () => {
	it("accepts a fresh token once past the min delay", () => {
		const token = createFormToken();
		expect(verifyFormToken(token, { minMs: 0 })).toEqual({ ok: true });
	});

	it("rejects submissions that arrive too fast", () => {
		const token = createFormToken();
		expect(verifyFormToken(token)).toMatchObject({ ok: false, reason: "too-fast" });
	});

	it("rejects an expired token", () => {
		const token = createFormToken();
		expect(verifyFormToken(token, { minMs: 0, maxMs: -1 })).toMatchObject({
			ok: false,
			reason: "expired",
		});
	});

	it("rejects a tampered signature", () => {
		const token = createFormToken();
		const tampered = `${token.slice(0, -1)}${token.endsWith("0") ? "1" : "0"}`;
		expect(verifyFormToken(tampered, { minMs: 0 })).toMatchObject({
			ok: false,
			reason: "bad-signature",
		});
	});

	it("rejects missing and malformed tokens", () => {
		expect(verifyFormToken(undefined)).toMatchObject({ reason: "missing-token" });
		expect(verifyFormToken("nodelimiter")).toMatchObject({
			reason: "malformed-token",
		});
	});
});

describe("verifyHuman", () => {
	const goodToken = () => createFormToken();

	it("passes a clean submission (honeypot empty, token valid)", async () => {
		const fd = new FormData();
		fd.set(HONEYPOT_FIELD, "");
		fd.set(TOKEN_FIELD, goodToken());
		expect(await verifyHuman({ formData: fd, timing: { minMs: 0 } })).toEqual({
			ok: true,
		});
	});

	it("rejects when the honeypot is filled", async () => {
		const fd = new FormData();
		fd.set(HONEYPOT_FIELD, "http://spam.example");
		fd.set(TOKEN_FIELD, goodToken());
		expect(await verifyHuman({ formData: fd })).toMatchObject({
			ok: false,
			reason: "honeypot",
		});
	});

	it("rejects when the token is missing", async () => {
		const fd = new FormData();
		fd.set(HONEYPOT_FIELD, "");
		expect(await verifyHuman({ formData: fd })).toMatchObject({
			ok: false,
			reason: "missing-token",
		});
	});

	it("works with a plain object as well as FormData", async () => {
		const result = await verifyHuman({
			formData: { [HONEYPOT_FIELD]: "", [TOKEN_FIELD]: goodToken() },
			timing: { minMs: 0 },
		});
		expect(result).toEqual({ ok: true });
	});
});

describe("graceful degradation without BOT_PROTECTION_SECRET", () => {
	it("disables the timing layer instead of throwing/dropping", async () => {
		const saved = process.env.BOT_PROTECTION_SECRET;
		delete process.env.BOT_PROTECTION_SECRET;
		vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			expect(createFormToken()).toBe("");
			// No token at all — still passes, because honeypot is the only
			// active gate when the secret is missing.
			const fd = new FormData();
			fd.set(HONEYPOT_FIELD, "");
			expect(await verifyHuman({ formData: fd })).toEqual({ ok: true });
			// Honeypot still rejects.
			const spam = new FormData();
			spam.set(HONEYPOT_FIELD, "filled");
			expect(await verifyHuman({ formData: spam })).toMatchObject({
				ok: false,
				reason: "honeypot",
			});
		} finally {
			process.env.BOT_PROTECTION_SECRET = saved;
			vi.restoreAllMocks();
		}
	});
});
