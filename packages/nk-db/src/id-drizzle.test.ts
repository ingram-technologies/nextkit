import { getTableColumns, type SQL, sql } from "drizzle-orm";
import { PgDialect, pgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from "vitest";
import { createDb } from "./drizzle.js";
import { createIdColumns } from "./id-drizzle.js";
import { createIdRegistry, uuidGenerateId } from "./id.js";
import { createTestDb, type TestDb } from "./pglite/index.js";

const ids = createIdRegistry({ invoice: "inv", account: "acct" });
const { idColumn, polymorphicIdColumn, sqlUuid, sqlUuidArray } = createIdColumns(ids);

const invoices = pgTable("invoices", {
	id: idColumn("invoice")(),
	account_id: idColumn("account")(),
	entity_id: polymorphicIdColumn(),
});

// Reach the column's JS<->driver mappings the way Drizzle does when binding a
// value (for an insert/update SET or a WHERE comparison) and when reading one.
const toDriver = (column: keyof typeof invoices.$inferSelect, value: string) =>
	getTableColumns(invoices)[column].mapToDriverValue(value);
const fromDriver = (column: keyof typeof invoices.$inferSelect, value: string) =>
	getTableColumns(invoices)[column].mapFromDriverValue(value);

/** The SQL + bound params Drizzle would actually send. */
const compile = (query: SQL) => new PgDialect().sqlToQuery(query);

// The raw-SQL bindings are only right if Postgres accepts what they send, so
// those run against a real database (no id758 functions: they decode in JS).
let testDb: TestDb;
beforeAll(async () => {
	testDb = await createTestDb({ id758: false, migrate: async () => {} });
});
afterAll(async () => {
	await testDb.close();
});

/** Evaluate a fragment in Postgres: its value as text and its SQL type. */
const evaluate = async (fragment: SQL) => {
	const { rows } = await createDb(testDb.pool, {}).execute<{
		value: string | null;
		type: string;
	}>(sql`select (${fragment})::text as value, pg_typeof(${fragment})::text as type`);
	return rows[0];
};

describe("createIdColumns", () => {
	it("keeps the column a plain uuid, so it needs no migration", () => {
		for (const column of ["id", "account_id", "entity_id"] as const) {
			expect(getTableColumns(invoices)[column].getSQLType()).toBe("uuid");
		}
	});

	it("decodes a skinned id bound to its own entity's column", () => {
		const uuid = uuidGenerateId();
		expect(toDriver("id", ids.invoice.encode(uuid))).toBe(uuid);
		expect(toDriver("account_id", ids.account.encode(uuid))).toBe(uuid);
	});

	it("passes a raw uuid through, so adopting it never regresses a call site", () => {
		const uuid = uuidGenerateId();
		expect(toDriver("id", uuid)).toBe(uuid);
	});

	it("passes a wrong-entity id through, so Postgres rejects it loudly", () => {
		// Silently decoding an acct_ id in an invoice column would query the wrong
		// row; leaving it intact makes it an invalid-uuid error instead.
		const wrong = ids.account.mint();
		expect(toDriver("id", wrong)).toBe(wrong);
	});

	it("encodes a read as the entity's public id", () => {
		const uuid = uuidGenerateId();
		expect(fromDriver("id", uuid)).toBe(ids.invoice.encode(uuid));
		expect(fromDriver("account_id", uuid)).toBe(ids.account.encode(uuid));
	});

	it("types the column as string, so a raw uuid is insertable and a read is assignable", () => {
		// Both forms are legal on the write side at runtime (toDriver is
		// tolerant), so the type must not reject either; the read side is a
		// public id at runtime, brand it at the seam.
		expectTypeOf<typeof invoices.$inferInsert.id>().toEqualTypeOf<
			string | null | undefined
		>();
		expectTypeOf<typeof invoices.$inferSelect.id>().toEqualTypeOf<string | null>();
	});

	it("leaves a polymorphic read raw: the column cannot know the prefix", () => {
		const uuid = uuidGenerateId();
		expect(fromDriver("entity_id", uuid)).toBe(uuid);
	});

	it("decodes any entity's id in a polymorphic column", () => {
		const uuid = uuidGenerateId();
		expect(toDriver("entity_id", ids.invoice.encode(uuid))).toBe(uuid);
		expect(toDriver("entity_id", ids.account.encode(uuid))).toBe(uuid);
	});

	it("binds a skinned id into raw SQL as its raw uuid", async () => {
		const uuid = uuidGenerateId();
		const fragment = sqlUuid(ids.invoice.encode(uuid));
		expect(compile(fragment).params).toEqual([uuid]);
		expect(await evaluate(fragment)).toEqual({ value: uuid, type: "uuid" });
	});

	it("binds null as a null uuid rather than the string 'null'", async () => {
		expect(compile(sqlUuid(null)).params).toEqual([null]);
		expect(compile(sqlUuid(undefined)).params).toEqual([null]);
		expect(await evaluate(sqlUuid(null))).toEqual({ value: null, type: "uuid" });
		expect(await evaluate(sqlUuid(undefined))).toEqual({
			value: null,
			type: "uuid",
		});
	});

	it("builds a uuid[] element-wise, not as a text[] cast", async () => {
		// pg binds a JS array as text[], and text[]::uuid[] is not a legal cast
		// (SQLSTATE 42846), so each element must be cast on its own.
		const a = uuidGenerateId();
		const b = uuidGenerateId();
		const fragment = sqlUuidArray([ids.invoice.encode(a), ids.account.encode(b)]);
		expect(compile(fragment).params).toEqual([a, b]);
		expect(await evaluate(fragment)).toEqual({
			value: `{${a},${b}}`,
			type: "uuid[]",
		});
	});
});
