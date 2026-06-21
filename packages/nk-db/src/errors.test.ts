import { describe, expect, it } from "vitest";
import { isPgError, isUniqueViolation, PG_UNIQUE_VIOLATION } from "./errors.js";

const pgErr = (code: string): Error => Object.assign(new Error("db error"), { code });

describe("isPgError", () => {
	it("matches a direct Postgres error code", () => {
		expect(isPgError(pgErr("23505"), "23505")).toBe(true);
		expect(isPgError(pgErr("23503"), "23505")).toBe(false);
	});

	it("walks the .cause chain", () => {
		const wrapped = new Error("wrapped", { cause: pgErr("23505") });
		expect(isPgError(wrapped, "23505")).toBe(true);
	});

	it("walks a nested .cause chain", () => {
		const inner = pgErr("23505");
		const mid = new Error("mid", { cause: inner });
		const outer = new Error("outer", { cause: mid });
		expect(isPgError(outer, "23505")).toBe(true);
	});

	it("returns false for non-errors and missing codes", () => {
		expect(isPgError(null, "23505")).toBe(false);
		expect(isPgError(undefined, "23505")).toBe(false);
		expect(isPgError("oops", "23505")).toBe(false);
		expect(isPgError(new Error("plain"), "23505")).toBe(false);
		expect(isPgError({ code: 23505 }, "23505")).toBe(false); // numeric, not string
	});
});

describe("isUniqueViolation", () => {
	it("is isPgError bound to 23505", () => {
		expect(PG_UNIQUE_VIOLATION).toBe("23505");
		expect(isUniqueViolation(pgErr("23505"))).toBe(true);
		expect(isUniqueViolation(pgErr("23514"))).toBe(false);
		expect(isUniqueViolation(new Error("x", { cause: pgErr("23505") }))).toBe(true);
	});
});
