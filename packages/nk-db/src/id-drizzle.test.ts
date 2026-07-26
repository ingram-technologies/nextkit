import { getTableColumns, type SQL } from "drizzle-orm";
import { PgDialect, pgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { createIdColumns } from "./id-drizzle.js";
import { createIdRegistry, uuidGenerateId } from "./id.js";

const ids = createIdRegistry({ invoice: "inv", account: "acct" });
const { idColumn, polymorphicIdColumn, sqlUuid, sqlUuidArray } = createIdColumns(ids);

const invoices = pgTable("invoices", {
	id: idColumn("invoice")(),
	account_id: idColumn("account")(),
	entity_id: polymorphicIdColumn(),
});

// Reach the column's JS->driver mapping the way Drizzle does when binding a
// value (for an insert/update SET or a WHERE comparison).
const toDriver = (column: keyof typeof invoices.$inferSelect, value: string) =>
	getTableColumns(invoices)[column].mapToDriverValue(value);

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
