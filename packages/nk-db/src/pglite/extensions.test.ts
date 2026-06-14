import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./index.js";

// An app whose migrations `CREATE EXTENSION pg_trgm` can only boot the PGlite
// harness if the extension module is registered at create time. This guards the
// `extensions` passthrough.
let testDb: TestDb;

beforeAll(async () => {
	testDb = await createTestDb({
		extensions: { pg_trgm },
		migrate: async (db) => {
			await db.exec("create extension if not exists pg_trgm;");
		},
	});
});

afterAll(async () => {
	await testDb.close();
});

describe("PGlite extensions passthrough", () => {
	it("registers a contrib extension so CREATE EXTENSION + its functions work", async () => {
		const { rows } = await testDb.pool.query<{ sim: number }>(
			"select similarity('postgres', 'postgre') as sim",
		);
		expect(rows[0]?.sim).toBeGreaterThan(0);
	});
});
