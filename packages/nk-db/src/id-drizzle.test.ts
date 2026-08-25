import { getTableColumns, type SQL } from "drizzle-orm";
import { PgDialect, pgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { createIdColumns } from "./id-drizzle.js";
import { createIdRegistry, uuidGenerateId } from "./id.js";

const ids = createIdRegistry({ invoice: "inv", account: "acct" });
const { idColumn, polymorphicIdColumn, encodedId, sqlUuid, sqlUuidArray } =
	createIdColumns(ids);

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
		const row: typeof invoices.$inferInsert = {
			id: uuidGenerateId(),
			account_id: ids.account.mint(),
			entity_id: uuidGenerateId(),
		};
		const read: string | null = (row as typeof invoices.$inferSelect).id;
		expect(read).toBe(row.id);
	});

	it("leaves a polymorphic read raw: the column cannot know the prefix", () => {
		const uuid = uuidGenerateId();
		expect(fromDriver("entity_id", uuid)).toBe(uuid);
	});

	it("selects a uuid as a public id through id758_encode", () => {
		const query = compile(encodedId("invoice", invoices.id));
		expect(query.sql).toBe('id758_encode($1, "invoices"."id")');
		expect(query.params).toEqual(["inv"]);
	});

	it("decodes any entity's id in a polymorphic column", () => {
		const uuid = uuidGenerateId();
		expect(toDriver("entity_id", ids.invoice.encode(uuid))).toBe(uuid);
		expect(toDriver("entity_id", ids.account.encode(uuid))).toBe(uuid);
	});

	it("binds a skinned id into raw SQL as its raw uuid", () => {
		const uuid = uuidGenerateId();
		const query = compile(sqlUuid(ids.invoice.encode(uuid)));
		expect(query.params).toEqual([uuid]);
		expect(query.sql).toBe("$1::uuid");
	});

	it("binds null as a null uuid rather than the string 'null'", () => {
		expect(compile(sqlUuid(null))).toMatchObject({
			sql: "$1::uuid",
			params: [null],
		});
		expect(compile(sqlUuid(undefined))).toMatchObject({ params: [null] });
	});

	it("builds a uuid[] element-wise, not as a text[] cast", () => {
		const a = uuidGenerateId();
		const b = uuidGenerateId();
		const query = compile(
			sqlUuidArray([ids.invoice.encode(a), ids.account.encode(b)]),
		);
		// pg binds a JS array as text[], and text[]::uuid[] is not a legal cast
		// (SQLSTATE 42846), so each element must be cast on its own.
		expect(query.sql).toBe("array[$1::uuid, $2::uuid]::uuid[]");
		expect(query.params).toEqual([a, b]);
	});
});
