import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyHmacSha256 } from "./webhooks";

const sign = (payload: string, secret: string, encoding: "hex" | "base64" = "hex") =>
	createHmac("sha256", secret).update(payload).digest(encoding);

describe("verifyHmacSha256", () => {
	const secret = "whsec_test";
	const payload = '{"event":"invoice.paid","id":"in_1"}';

	it("accepts a correct hex signature", () => {
		const signature = sign(payload, secret);
		expect(verifyHmacSha256({ payload, signature, secret })).toEqual({
			valid: true,
		});
	});

	it("strips a leading sha256= prefix", () => {
		const signature = `sha256=${sign(payload, secret)}`;
		expect(verifyHmacSha256({ payload, signature, secret }).valid).toBe(true);
	});

	it("accepts a correct base64 signature", () => {
		const signature = sign(payload, secret, "base64");
		expect(
			verifyHmacSha256({ payload, signature, secret, encoding: "base64" }).valid,
		).toBe(true);
	});

	it("rejects a wrong secret", () => {
		const signature = sign(payload, "other");
		expect(verifyHmacSha256({ payload, signature, secret }).valid).toBe(false);
	});

	it("rejects a tampered payload", () => {
		const signature = sign(payload, secret);
		const result = verifyHmacSha256({ payload: `${payload} `, signature, secret });
		expect(result).toEqual({ valid: false, error: "Invalid webhook signature" });
	});

	it("rejects a malformed (wrong-length) signature without throwing", () => {
		expect(verifyHmacSha256({ payload, signature: "deadbeef", secret }).valid).toBe(
			false,
		);
	});

	it("reports missing signature and secret", () => {
		expect(verifyHmacSha256({ payload, signature: "", secret }).error).toMatch(
			/signature/,
		);
		expect(verifyHmacSha256({ payload, signature: "x", secret: "" }).error).toMatch(
			/secret/,
		);
	});
});
