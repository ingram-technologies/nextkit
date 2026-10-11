import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createTestDb, type TestDb } from "./pglite/index.js";
import {
	createQueries,
	type PoolQueries,
	parseMaybeRow,
	parseOneRow,
	parseRows,
} from "./queries.js";

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

describe("createQueries against Postgres", () => {
	let testDb: TestDb;
	let q: PoolQueries;

	beforeAll(async () => {
		testDb = await createTestDb({
			id758: false,
			migrate: async (db) => {
				await db.exec(
					"create table balances (currency text primary key, amount numeric(12,4) not null)",
				);
			},
		});
		q = createQueries(testDb.pool);
	});
	beforeEach(async () => {
		await testDb.reset();
	});
	afterAll(async () => {
		await testDb.close();
	});

	const currencies = async (): Promise<string[]> =>
		(
			await q.query(
				"select currency from balances order by currency",
				[],
				Balance.pick({ currency: true }),
			)
		).map((row) => row.currency);

	it("withTx commits what the callback wrote and returns its result", async () => {
		const result = await q.withTx(async (tx) => {
			await tx.execute("insert into balances values ('EUR', 1)");
			await tx.execute("insert into balances values ('USD', 2)");
			return "done";
		});
		expect(result).toBe("done");
		expect(await currencies()).toEqual(["EUR", "USD"]);
	});

	it("withTx rolls back on throw and rethrows the original error", async () => {
		const boom = new Error("boom");
		const error = await q
			.withTx(async (tx) => {
				await tx.execute("insert into balances values ('EUR', 1)");
				throw boom;
			})
			.catch((e: unknown) => e);
		expect(error).toBe(boom);
		expect(await currencies()).toEqual([]);
		// The connection went back to the pool usable, outside any transaction.
		await q.execute("insert into balances values ('GBP', 3)");
		expect(await currencies()).toEqual(["GBP"]);
	});

	it("one requires exactly one row", async () => {
		await expect(q.one("select * from balances")).rejects.toThrow("got none");
		await q.execute("insert into balances values ('EUR', 1), ('USD', 2)");
		await expect(q.one("select * from balances")).rejects.toThrow("got 2");
		await expect(
			q.one("select * from balances where currency = $1", ["EUR"], Balance),
		).resolves.toEqual({ currency: "EUR", amount: 1 });
	});

	it("maybeOne returns null for no row", async () => {
		await expect(q.maybeOne("select * from balances")).resolves.toBeNull();
	});

	it("query with a schema validates and coerces the driver's numeric strings", async () => {
		await q.execute("insert into balances values ('EUR', 12.5)");
		// Unvalidated, pg hands numeric back as a string...
		const [raw] = await q.query("select amount from balances");
		expect(typeof raw?.amount).toBe("string");
		// ...the schema is where it becomes a number.
		expect(await q.query("select * from balances", [], Balance)).toEqual([
			{ currency: "EUR", amount: 12.5 },
		]);
	});

	it("execute returns the affected row count", async () => {
		expect(
			await q.execute("insert into balances values ('EUR', 1), ('USD', 2)"),
		).toBe(2);
		expect(await q.execute("update balances set amount = 0")).toBe(2);
		expect(await q.execute("delete from balances where currency = 'XXX'")).toBe(0);
	});
});
