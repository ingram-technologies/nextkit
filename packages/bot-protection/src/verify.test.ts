import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
