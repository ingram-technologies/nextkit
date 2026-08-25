import { eq, sql } from "drizzle-orm";
import { pgTable, text } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "./drizzle.js";
import { createIdColumns } from "./id-drizzle.js";
import { ID758_SQL_STATEMENTS, id758Migration } from "./id-sql.js";
import { createIdRegistry, uuidv7 } from "./id.js";
import { createTestDb, type TestDb } from "./pglite/index.js";

// The whole point of the id work, end to end: with the functions in the
// database and `idColumn` on the schema, application code never sees a uuid.
const ids = createIdRegistry({ invoice: "inv", account: "acct" });
const { idColumn, polymorphicIdColumn, encodedId } = createIdColumns(ids);

const invoices = pgTable("invoices", {
	id: idColumn("invoice")()
		.primaryKey()
		.default(sql`uuidv7()`),
	account_id: idColumn("account")().notNull(),
	entity_id: polymorphicIdColumn(),
	entity_type: text("entity_type"),
});

let testDb: TestDb;
beforeAll(async () => {
	testDb = await createTestDb({
		migrate: async (db) => {
			await db.exec(`create table invoices (
				id uuid primary key default uuidv7(),
				account_id uuid not null,
				entity_id uuid,
				entity_type text
			);`);
		},
	});
});
afterAll(async () => {
	await testDb.close();
});

describe("id758Migration", () => {
	it("is the statements joined by drizzle breakpoints", () => {
		const chunks = id758Migration.trimEnd().split("\n--> statement-breakpoint\n");
		expect(chunks).toEqual([...ID758_SQL_STATEMENTS]);
	});
});

describe("PGlite harness", () => {
	it("installs the functions by default", async () => {
		const id = ids.invoice.mint();
		const { rows } = await testDb.pool.query<{ uuid: string; back: string }>(
			"select id758_decode($1) as uuid, id758_encode('inv', id758_decode($1)) as back",
			[id],
		);
		expect(rows[0]).toEqual({ uuid: ids.invoice.decode(id), back: id });
	});

	it("can be told not to", async () => {
		const bare = await createTestDb({ id758: false, migrate: async () => {} });
		try {
			await expect(bare.pool.query("select id758_prefix('x')")).rejects.toThrow(
				/does not exist/,
			);
		} finally {
			await bare.close();
		}
	});
});

describe("idColumn end to end", () => {
	it("takes public ids in and gives public ids out", async () => {
		const db = createDb(testDb.pool, { invoices });
		const account = ids.account.mint();
		const [inserted] = await db
			.insert(invoices)
			.values({ id: ids.invoice.mint(), account_id: account })
			.returning();
		if (!inserted) throw new Error("no row");
		expect(ids.invoice.is(inserted.id)).toBe(true);
		expect(inserted.account_id).toBe(account);

		// A WHERE on the public id hits the row; the read is public again.
		const [read] = await db
			.select()
			.from(invoices)
			.where(eq(invoices.id, inserted.id));
		expect(read).toEqual(inserted);

		// The database default (a raw uuidv7) is encoded on the way out too.
		const [defaulted] = await db
			.insert(invoices)
			.values({ account_id: account })
			.returning();
		expect(defaulted && ids.invoice.is(defaulted.id)).toBe(true);
	});

	it("agrees with the SQL functions on the same row", async () => {
		const db = createDb(testDb.pool, { invoices });
		const [row] = await db
			.select({
				id: invoices.id,
				viaSql: encodedId("invoice", invoices.id),
				raw: sql<string>`${invoices.id}::text`,
			})
			.from(invoices)
			.limit(1);
		if (!row) throw new Error("no row");
		expect(row.viaSql).toBe(row.id);
		expect(row.raw).toBe(ids.invoice.decode(row.id));
	});

	it("encodes a polymorphic column once the row has resolved its type", async () => {
		const db = createDb(testDb.pool, { invoices });
		const target = ids.account.mint();
		const [row] = await db
			.insert(invoices)
			.values({ account_id: target, entity_id: target, entity_type: "account" })
			.returning({
				entity_id: invoices.entity_id,
				entity: encodedId("account", invoices.entity_id),
			});
		expect(row).toEqual({ entity_id: ids.account.decode(target), entity: target });
	});

	it("raw sql can filter on a public id with id758_decode", async () => {
		const db = createDb(testDb.pool, { invoices });
		const [row] = await db.select({ id: invoices.id }).from(invoices).limit(1);
		if (!row) throw new Error("no row");
		const { rows } = await testDb.pool.query<{ n: number }>(
			"select count(*)::int as n from invoices where id = id758_decode($1)",
			[row.id],
		);
		expect(rows[0]?.n).toBe(1);
		expect(uuidv7()).not.toBe(row.id);
	});
});
