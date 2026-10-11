import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./index.js";
import { resetPublicTables } from "./reset.js";

describe("TestDb.reset", () => {
	let testDb: TestDb;

	beforeAll(async () => {
		testDb = await createTestDb({
			id758: false,
			migrate: async (db) => {
				await db.exec(`
					create table parents (id serial primary key, name text);
					create table children (
						id serial primary key,
						parent_id int not null references parents (id)
					);
					create table "MixedCase" (id serial primary key);
					create table "with""quote" (id int);
				`);
			},
		});
	});
	afterAll(async () => {
		await testDb.close();
	});

	const count = async (table: string): Promise<number> => {
		const { rows } = await testDb.pool.query<{ n: number }>(
			`select count(*)::int as n from ${table}`,
		);
		return rows[0]?.n ?? -1;
	};

	it("empties every public table, FK-linked and oddly named ones included", async () => {
		await testDb.pool.query("insert into parents (name) values ('p')");
		await testDb.pool.query("insert into children (parent_id) values (1)");
		await testDb.pool.query('insert into "MixedCase" default values');
		await testDb.pool.query('insert into "with""quote" values (1)');

		await testDb.reset();

		for (const table of ["parents", "children", '"MixedCase"', '"with""quote"']) {
			expect(await count(table)).toBe(0);
		}
	});

	it("restarts identity sequences, so ids are deterministic per test", async () => {
		await testDb.pool.query("insert into parents (name) values ('a'), ('b')");
		await testDb.reset();
		const { rows } = await testDb.pool.query<{ id: number }>(
			"insert into parents (name) values ('c') returning id",
		);
		expect(rows[0]?.id).toBe(1);
	});

	it("is idempotent", async () => {
		await testDb.reset();
		await testDb.reset();
		expect(await count("parents")).toBe(0);
	});
});

describe("resetPublicTables on an empty schema", () => {
	it("is a no-op rather than an invalid TRUNCATE", async () => {
		const bare = await createTestDb({ id758: false, migrate: async () => {} });
		try {
			await expect(
				resetPublicTables((sql) => bare.pool.query<{ tablename: string }>(sql)),
			).resolves.toBeUndefined();
		} finally {
			await bare.close();
		}
	});
});
