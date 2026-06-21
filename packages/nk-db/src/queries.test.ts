import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseMaybeRow, parseOneRow, parseRows } from "./queries.js";

// A row schema that also coerces, the way a real call site would: Postgres
// returns `numeric` as a string and a function's boolean result untyped, so the
// schema is where validation and coercion fold together.
const Balance = z.object({
	currency: z.string(),
	amount: z.coerce.number(),
});

describe("parseRows", () => {
	it("validates and coerces every row", () => {
		const out = parseRows(
			{
				rows: [
					{ currency: "EUR", amount: "12.5000" },
					{ currency: "USD", amount: "0" },
				],
			},
			Balance,
		);
		expect(out).toEqual([
			{ currency: "EUR", amount: 12.5 },
			{ currency: "USD", amount: 0 },
		]);
	});

	it("returns an empty array for no rows", () => {
		expect(parseRows({ rows: [] }, Balance)).toEqual([]);
	});

	it("throws when a row does not match the schema", () => {
		expect(() => parseRows({ rows: [{ currency: "EUR" }] }, Balance)).toThrow();
	});
});

describe("parseMaybeRow", () => {
	it("returns the parsed first row", () => {
		expect(
			parseMaybeRow({ rows: [{ currency: "EUR", amount: "9.99" }] }, Balance),
		).toEqual({ currency: "EUR", amount: 9.99 });
	});

	it("returns null when there are no rows", () => {
		expect(parseMaybeRow({ rows: [] }, Balance)).toBeNull();
	});
});

describe("parseOneRow", () => {
	it("returns the single parsed row", () => {
		expect(
			parseOneRow({ rows: [{ currency: "EUR", amount: "1" }] }, Balance),
		).toEqual({
			currency: "EUR",
			amount: 1,
		});
	});

	it("throws on no rows", () => {
		expect(() => parseOneRow({ rows: [] }, Balance)).toThrow("got none");
	});

	it("throws on more than one row", () => {
		expect(() =>
			parseOneRow(
				{
					rows: [
						{ currency: "EUR", amount: "1" },
						{ currency: "USD", amount: "2" },
					],
				},
				Balance,
			),
		).toThrow("got 2");
	});
});
