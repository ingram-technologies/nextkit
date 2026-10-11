import { describe, expect, it } from "vitest";
import {
	CREDENTIAL_PROVIDER_ID,
	DEFAULT_MAX_PASSWORD_LENGTH,
	DEFAULT_MIN_PASSWORD_LENGTH,
	passwordSchema,
	validateNewPassword,
} from "./password.js";

describe("password constants", () => {
	it("mirror Better Auth's emailAndPassword defaults", () => {
		// If a Better Auth upgrade changes these, this file is the deliberate
		// checkpoint: bump the constant and confirm the new default on purpose.
		expect(DEFAULT_MIN_PASSWORD_LENGTH).toBe(8);
		expect(DEFAULT_MAX_PASSWORD_LENGTH).toBe(128);
		expect(CREDENTIAL_PROVIDER_ID).toBe("credential");
	});
});

describe("passwordSchema", () => {
	it("rejects passwords under the default minimum", () => {
		expect(passwordSchema().safeParse("short").success).toBe(false);
	});

	it("accepts a password at the default minimum", () => {
		expect(passwordSchema().safeParse("12345678").success).toBe(true);
	});

	it("honours an overridden minimum", () => {
		expect(passwordSchema({ minLength: 12 }).safeParse("12345678").success).toBe(
			false,
		);
	});

	it("rejects a password over the maximum", () => {
		expect(
			passwordSchema({ maxLength: 10 }).safeParse("x".repeat(11)).success,
		).toBe(false);
	});
});

describe("validateNewPassword", () => {
	it("returns null for a valid, matching pair", () => {
		expect(validateNewPassword("goodpassword", "goodpassword")).toBeNull();
	});

	it("flags a too-short password with the resolved minimum", () => {
		expect(validateNewPassword("short", "short")).toMatchObject({
			code: "password_too_short",
			minLength: DEFAULT_MIN_PASSWORD_LENGTH,
		});
	});

	it("flags a too-long password with the resolved maximum", () => {
		const long = "x".repeat(6);
		expect(
			validateNewPassword(long, long, { minLength: 1, maxLength: 5 }),
		).toMatchObject({ code: "password_too_long", maxLength: 5 });
	});

	it("flags a mismatch only once length passes", () => {
		expect(validateNewPassword("goodpassword", "different")).toMatchObject({
			code: "passwords_do_not_match",
		});
	});

	it("checks length before match (short + mismatched -> too_short)", () => {
		expect(validateNewPassword("short", "other")).toMatchObject({
			code: "password_too_short",
		});
	});
});

describe("passwordSchema and validateNewPassword agree", () => {
	// The client form and the server each pick one of the two; at every length
	// boundary they must give the same verdict, or a password passes one side
	// and fails the other.
	const cases: Array<[string, { minLength?: number; maxLength?: number }]> = [
		["default policy", {}],
		["overridden policy", { minLength: 12, maxLength: 20 }],
	];
	it.each(cases)("at min-1, min, max and max+1 (%s)", (_name, policy) => {
		const min = policy.minLength ?? DEFAULT_MIN_PASSWORD_LENGTH;
		const max = policy.maxLength ?? DEFAULT_MAX_PASSWORD_LENGTH;
		for (const [length, valid] of [
			[min - 1, false],
			[min, true],
			[max, true],
			[max + 1, false],
		] as const) {
			const pw = "x".repeat(length);
			expect(passwordSchema(policy).safeParse(pw).success, `${length}`).toBe(
				valid,
			);
			expect(validateNewPassword(pw, pw, policy) === null, `${length}`).toBe(
				valid,
			);
		}
	});
});
